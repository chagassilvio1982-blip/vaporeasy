import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" }
  });
}
async function body(req: Request) {
  try { return await req.json(); } catch { return {}; }
}
function clean(v: unknown, max = 250) {
  return String(v ?? "").trim().slice(0, max);
}
function normalizePlate(v: unknown) {
  const x = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return x || null;
}
function spDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const g = (t: string) => Number(parts.find(p => p.type === t)?.value || 0);
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day") + offset)).toISOString().slice(0, 10);
}
async function linkByToken(db: ReturnType<typeof admin>, token: string) {
  if (!token) return null;
  const r = await db.from("public_booking_links")
    .select("id,token,client_id,allow_same_day,active,revoked_at,created_at")
    .eq("token", token).eq("active", true).is("revoked_at", null).maybeSingle();
  return r.error ? null : r.data;
}
async function findVehicleByPlate(db: ReturnType<typeof admin>, plate: string | null) {
  if (!plate) return null;
  const r = await db.from("vehicles")
    .select("id,client_id,brand,model,plate,package_size")
    .eq("plate", plate).is("archived_at", null).limit(1).maybeSingle();
  return r.error ? null : r.data;
}
function normalizeAddonIds(v: unknown) {
  if (!Array.isArray(v)) return [] as string[];
  return [...new Set(v.map(x => clean(x, 80)).filter(Boolean))].slice(0, 20);
}
async function getPublicAddonSelection(db: ReturnType<typeof admin>, raw: unknown, serviceId: string) {
  const ids = normalizeAddonIds(raw);
  if (!ids.length) return { ids, addons: [] as any[], value: 0, duration: 0 };
  const r = await db.from("service_addons")
    .select("id,name,price,duration_minutes,sort_order")
    .eq("active", true).eq("public_enabled", true).in("id", ids).order("sort_order");
  if (r.error) throw r.error;
  const addons = r.data || [];
  if (addons.length !== ids.length) throw Error("Um dos serviços extras selecionados não está disponível.");
  if (serviceId) {
    const cr = await db.from("service_addon_compatibility")
      .select("addon_id,service_id,enabled").in("addon_id", ids);
    if (cr.error) throw cr.error;
    const rows = cr.data || [];
    for (const id of ids) {
      const scoped = rows.filter((x: any) => x.addon_id === id);
      if (scoped.length && !scoped.some((x: any) => x.service_id === serviceId && x.enabled !== false)) {
        throw Error("Um dos extras selecionados não é compatível com este serviço.");
      }
    }
  }
  const rr = await db.from("service_addon_rules")
    .select("addon_id,related_addon_id,relation")
    .eq("relation", "excludes").in("addon_id", ids).in("related_addon_id", ids);
  if (rr.error) throw rr.error;
  if ((rr.data || []).length) {
    throw Error("A Hidratação dos bancos/couro já inclui a Limpeza técnica dos bancos. Escolha apenas a Hidratação.");
  }
  return {
    ids,
    addons,
    value: addons.reduce((sum: number, a: any) => sum + Number(a.price || 0), 0),
    duration: addons.reduce((sum: number, a: any) => sum + Number(a.duration_minutes || 0), 0)
  };
}
async function getPublicSlots(
  db: ReturnType<typeof admin>,
  date: string,
  serviceId: string,
  vehicleId: string | null,
  addonIds: string[] = []
) {
  const r = await db.rpc("get_available_slots_public", {
    p_date: date,
    p_service_id: serviceId,
    p_vehicle_id: vehicleId,
    p_addon_ids: addonIds
  });
  if (r.error) throw r.error;
  return (r.data || []) as Array<{ starts_at: string; local_time: string }>;
}
function validDateForLink(date: string, allowSameDay: boolean) {
  const today = spDate(0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return allowSameDay ? date >= today : date > today;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const action = u.searchParams.get("action") || "";
  const db = admin();

  if (req.method === "GET" && action === "public-config") {
    const token = clean(u.searchParams.get("token"), 80);
    const link = await linkByToken(db, token);
    if (!link) return json({ error: "Link inválido ou inativo." }, 404);

    const [services, brands, models, addons, rules, compat] = await Promise.all([
      db.from("services")
        .select("id,name,category,price,price_pm,price_g,size_pricing_enabled,duration_minutes,booking_mode,first_slot_time")
        .eq("active", true).order("name"),
      db.from("vehicle_brands").select("id,name").eq("active", true).order("name"),
      db.from("vehicle_models").select("id,brand_id,name").eq("active", true).order("name"),
      db.from("service_addons").select("id,name,description,price,duration_minutes,sort_order")
        .eq("active", true).eq("public_enabled", true).order("sort_order"),
      db.from("service_addon_rules").select("addon_id,related_addon_id,relation"),
      db.from("service_addon_compatibility").select("addon_id,service_id,enabled")
    ]);
    if (services.error || brands.error || models.error || addons.error || rules.error || compat.error) {
      return json({ error: "Não foi possível carregar o agendamento." }, 500);
    }

    let client: any = null;
    let vehicles: any[] = [];
    if (link.client_id) {
      const cr = await db.from("clients")
        .select("id,name,address,phone,whatsapp,condominium_id")
        .eq("id", link.client_id).is("archived_at", null).maybeSingle();
      if (cr.data) {
        let condominium = "";
        if (cr.data.condominium_id) {
          const co = await db.from("condominiums").select("name").eq("id", cr.data.condominium_id).maybeSingle();
          condominium = co.data?.name || "";
        }
        client = { id: cr.data.id, name: cr.data.name, address: cr.data.address || "", condominium };
        const vr = await db.from("vehicles")
          .select("id,brand,model,plate,year,color,package_size")
          .eq("client_id", cr.data.id).is("archived_at", null).order("brand");
        vehicles = vr.data || [];
      }
    }

    const completed = await db.from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed").is("deleted_at", null)
      .gte("completed_at", "2026-09-20T13:45:00.000Z");
    const baseSaved = 80 * 72 * (200 - 10);
    const waterSaved = baseSaved + ((completed.count || 0) * 190);

    return json({
      allow_same_day: link.allow_same_day,
      today: spDate(0),
      personalized: !!client,
      client,
      vehicles,
      services: services.data || [],
      addons: addons.data || [],
      addon_rules: rules.data || [],
      addon_compatibility: compat.data || [],
      brands: brands.data || [],
      models: models.data || [],
      water_savings: {
        total_liters: waterSaved,
        conventional_liters_per_car: 200,
        vaporeasy_liters_per_car: 10,
        saved_liters_per_service: 190,
        base_liters: baseSaved
      }
    });
  }

  if (req.method === "POST" && (action === "public-dates" || action === "public-slots")) {
    const b = await body(req);
    const token = clean(b.token, 80);
    const serviceId = clean(b.service_id, 80);
    const date = clean(b.date, 10);
    const plate = normalizePlate(b.plate);
    const requestedVehicleId = clean(b.vehicle_id, 80) || null;
    const link = await linkByToken(db, token);
    if (!link) return json({ error: "Link inválido ou inativo." }, 404);

    let addonSelection;
    try { addonSelection = await getPublicAddonSelection(db, b.addon_ids, serviceId); }
    catch (e) { return json({ error: String((e as any)?.message || e) }, 400); }

    let vehicle: any = null;
    if (requestedVehicleId && link.client_id) {
      const vr = await db.from("vehicles").select("id,client_id,brand,model,plate,package_size")
        .eq("id", requestedVehicleId).eq("client_id", link.client_id).is("archived_at", null).maybeSingle();
      vehicle = vr.data || null;
    }
    if (!vehicle && link.client_id && plate) {
      const byPlate = await findVehicleByPlate(db, plate);
      if (byPlate?.client_id === link.client_id) vehicle = byPlate;
    }

    if (action === "public-dates") {
      const start = link.allow_same_day ? spDate(0) : spDate(1);
      const r = await db.rpc("get_available_dates_public", {
        p_start_date: start,
        p_service_id: serviceId,
        p_vehicle_id: vehicle?.id || null,
        p_addon_ids: addonSelection.ids,
        p_days: 60
      });
      if (r.error) return json({ error: r.error.message }, 400);
      let dates = (r.data || []).map((x: any) => x.available_date);
      if (link.allow_same_day && dates.includes(spDate(0))) {
        try {
          const slots = await getPublicSlots(db, spDate(0), serviceId, vehicle?.id || null, addonSelection.ids);
          if (!slots.some(x => new Date(x.starts_at).getTime() > Date.now())) {
            dates = dates.filter((d: string) => d !== spDate(0));
          }
        } catch {}
      }
      return json({ dates });
    }

    if (!validDateForLink(date, !!link.allow_same_day)) {
      return json({ error: "Data não permitida por este link." }, 400);
    }
    try {
      let slots = await getPublicSlots(db, date, serviceId, vehicle?.id || null, addonSelection.ids);
      if (date === spDate(0)) slots = slots.filter(x => new Date(x.starts_at).getTime() > Date.now());
      return json({ slots });
    } catch (e) {
      return json({ error: String((e as any)?.message || e) }, 400);
    }
  }

  if (req.method === "POST" && action === "public-submit") {
    const b = await body(req);
    const token = clean(b.token, 80);
    const link = await linkByToken(db, token);
    if (!link) return json({ error: "Link inválido ou inativo." }, 404);

    const name = clean(b.name, 120);
    const phone = clean(b.phone, 40);
    const condominium = clean(b.condominium, 120);
    const address = clean(b.address, 220);
    const brand = clean(b.brand, 80);
    const model = clean(b.model, 100);
    const year = clean(b.year, 12);
    const color = clean(b.color, 40);
    const packageSize = clean(b.package_size, 4).toLowerCase();
    const notes = clean(b.notes, 500);
    const serviceId = clean(b.service_id, 80);
    const date = clean(b.date, 10);
    const localTime = clean(b.local_time, 5);
    const plate = normalizePlate(b.plate);
    const requestId = clean(b.request_id, 80) || crypto.randomUUID();
    const requestedVehicleId = clean(b.vehicle_id, 80) || null;
    const idem = "public:" + token + ":" + requestId;

    if (packageSize && packageSize !== "pm" && packageSize !== "g") {
      return json({ error: "Porte do veículo inválido." }, 400);
    }

    const previous = await db.from("appointments")
      .select("id,status,starts_at,service_id").eq("idempotency_key", idem).maybeSingle();
    if (previous.error) return json({ error: "Não foi possível verificar a reserva anterior." }, 500);
    if (previous.data) {
      return json({
        ok: true,
        appointment: previous.data,
        requires_confirmation: previous.data.status === "requested",
        reused: true
      });
    }

    if (!serviceId || !date || !localTime) return json({ error: "Selecione serviço, data e horário." }, 400);
    if (!link.client_id && (!name || !phone)) return json({ error: "Preencha nome e contato." }, 400);
    if (!validDateForLink(date, !!link.allow_same_day)) return json({ error: "Essa data não está disponível neste link." }, 400);

    const sr = await db.from("services")
      .select("id,name,price,price_pm,price_g,size_pricing_enabled,duration_minutes,booking_mode,active")
      .eq("id", serviceId).eq("active", true).maybeSingle();
    if (sr.error || !sr.data) return json({ error: "Serviço indisponível." }, 400);
    const service = sr.data;

    let addonSelection;
    try { addonSelection = await getPublicAddonSelection(db, b.addon_ids, serviceId); }
    catch (e) { return json({ error: String((e as any)?.message || e) }, 400); }

    let existingVehicle = await findVehicleByPlate(db, plate);
    if (!link.client_id && existingVehicle) {
      return json({ error: "Esta placa já possui cadastro. Solicite à Vaporeasy um link personalizado para este veículo." }, 409);
    }
    if (link.client_id && existingVehicle && existingVehicle.client_id !== link.client_id) {
      return json({ error: "Esta placa já está vinculada a outro cadastro. Fale com a Vaporeasy para conferência." }, 409);
    }

    let clientId: string | null = link.client_id || null;
    let vehicleId: string | null = null;

    if (link.client_id && requestedVehicleId) {
      const vr = await db.from("vehicles").select("id,client_id,brand,model,plate,package_size")
        .eq("id", requestedVehicleId).eq("client_id", link.client_id).is("archived_at", null).maybeSingle();
      if (!vr.data) return json({ error: "Veículo não pertence a este cadastro." }, 400);
      vehicleId = vr.data.id;
      existingVehicle = vr.data;
    } else if (existingVehicle && link.client_id && existingVehicle.client_id === link.client_id) {
      vehicleId = existingVehicle.id;
      clientId = existingVehicle.client_id;
    }

    if (!clientId) {
      let cr = await db.from("clients").select("id").eq("phone", phone).is("archived_at", null).limit(1).maybeSingle();
      if (!cr.data) cr = await db.from("clients").select("id").eq("whatsapp", phone).is("archived_at", null).limit(1).maybeSingle();
      clientId = cr.data?.id || null;

      let condominiumId: string | null = null;
      if (condominium) {
        const cf = await db.from("condominiums").select("id").ilike("name", condominium).limit(1).maybeSingle();
        if (cf.data?.id) condominiumId = cf.data.id;
        else {
          const ci = await db.from("condominiums").insert({ name: condominium }).select("id").single();
          if (!ci.error) condominiumId = ci.data.id;
        }
      }

      if (!clientId) {
        const ci = await db.from("clients").insert({
          name, phone, whatsapp: phone, address, condominium_id: condominiumId,
          notes: "Cadastro originado pelo agendamento público."
        }).select("id").single();
        if (ci.error) return json({ error: "Não foi possível cadastrar os dados do cliente." }, 400);
        clientId = ci.data.id;
      }
    }

    if (clientId && !vehicleId) {
      if (!brand || !model) return json({ error: "Selecione um veículo cadastrado ou informe um novo veículo." }, 400);
      if (plate) {
        const samePlate = await findVehicleByPlate(db, plate);
        if (samePlate && samePlate.client_id !== clientId) {
          return json({ error: "Esta placa já está vinculada a outro cadastro. Fale com a Vaporeasy para conferência." }, 409);
        }
        if (samePlate && samePlate.client_id === clientId) {
          vehicleId = samePlate.id;
          existingVehicle = samePlate;
        }
      }
      if (!vehicleId) {
        const vi = await db.from("vehicles").insert({
          client_id: clientId, brand, model, plate, year, color,
          package_size: packageSize || null,
          notes: "Veículo cadastrado pelo agendamento público."
        }).select("id,client_id,brand,model,plate,package_size").single();
        if (vi.error) return json({ error: vi.error.message }, 400);
        vehicleId = vi.data.id;
        existingVehicle = vi.data;
      }
    }

    if (!clientId || !vehicleId) return json({ error: "Não foi possível identificar cliente e veículo." }, 400);

    if (service.size_pricing_enabled) {
      let effectiveSize = packageSize || clean(existingVehicle?.package_size, 4).toLowerCase();
      if (effectiveSize !== "pm" && effectiveSize !== "g") {
        const vr = await db.from("vehicles").select("package_size").eq("id", vehicleId).maybeSingle();
        effectiveSize = clean(vr.data?.package_size, 4).toLowerCase();
      }
      if (effectiveSize !== "pm" && effectiveSize !== "g") {
        return json({ error: "Selecione o porte P/M ou G do veículo para aplicar o preço correto do pacote." }, 400);
      }
      const ur = await db.from("vehicles").update({ package_size: effectiveSize }).eq("id", vehicleId);
      if (ur.error) return json({ error: "Não foi possível salvar o porte do veículo." }, 400);
    }

    let slots: Array<{ starts_at: string; local_time: string }>;
    try {
      slots = await getPublicSlots(db, date, serviceId, vehicleId, addonSelection.ids);
      if (date === spDate(0)) slots = slots.filter(x => new Date(x.starts_at).getTime() > Date.now());
    } catch (e) {
      return json({ error: String((e as any)?.message || e) }, 400);
    }
    const slot = slots.find(x => x.local_time === localTime);
    if (!slot) return json({ error: "Esse horário acabou de ficar indisponível. Escolha outro horário." }, 409);

    const status = service.booking_mode === "request" ? "requested" : "scheduled";
    const ar = await db.rpc("create_public_booking_secure", {
      p_client_id: clientId,
      p_vehicle_id: vehicleId,
      p_service_id: serviceId,
      p_starts_at: slot.starts_at,
      p_status: status,
      p_notes: notes,
      p_idempotency_key: idem,
      p_addon_ids: addonSelection.ids
    }).single();

    if (ar.error) {
      if (ar.error.code === "23505") {
        const prev = await db.from("appointments").select("id,status,starts_at")
          .eq("idempotency_key", idem).maybeSingle();
        if (prev.data) return json({ ok: true, appointment: prev.data, requires_confirmation: service.booking_mode === "request" });
      }
      return json({ error: ar.error.message }, ar.error.code === "P0001" ? 409 : 400);
    }

    return json({
      ok: true,
      appointment: ar.data,
      addons: addonSelection.addons,
      addon_value: addonSelection.value,
      addon_duration_minutes: addonSelection.duration,
      requires_confirmation: service.booking_mode === "request"
    });
  }

  return json({ error: "Rota não encontrada." }, 404);
});
