
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
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
  if (r.error) return null;
  return r.data;
}
async function requireActiveUser(req: Request, db: ReturnType<typeof admin>) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: json({ error: "Sessão ausente." }, 401) };
  const u = await db.auth.getUser(token);
  if (u.error || !u.data.user) return { error: json({ error: "Sessão inválida." }, 401) };
  const p = await db.from("app_profiles").select("role,active").eq("user_id", u.data.user.id).maybeSingle();
  if (p.error || !p.data?.active) return { error: json({ error: "Usuário sem acesso." }, 403) };
  return { user: u.data.user, profile: p.data };
}

async function requireManager(req: Request, db: ReturnType<typeof admin>) {
  const auth = await requireActiveUser(req, db);
  if (auth.error) return auth;
  if (!["owner", "admin"].includes(String(auth.profile?.role || ""))) {
    return { error: json({ error: "Apenas proprietário ou administrador pode gerenciar acessos." }, 403) };
  }
  return auth;
}
function normalizeAccessRole(v: unknown) {
  const role = clean(v, 30).toLowerCase();
  return role === "admin" ? "admin" : "operator";
}
async function listManagedAccounts(db: ReturnType<typeof admin>) {
  const [usersResult, profilesResult, collabsResult] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 200 }),
    db.from("app_profiles").select("user_id,name,role,active"),
    db.from("collaborators").select("id,user_id,name").not("user_id", "is", null)
  ]);
  if (usersResult.error) throw usersResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (collabsResult.error) throw collabsResult.error;
  const profiles = new Map((profilesResult.data || []).map((p: any) => [p.user_id, p]));
  const collabs = new Map((collabsResult.data || []).map((c: any) => [c.user_id, c]));
  return (usersResult.data?.users || []).map((u: any) => {
    const p: any = profiles.get(u.id) || null;
    const c: any = collabs.get(u.id) || null;
    return {
      user_id: u.id,
      email: u.email || "",
      name: p?.name || c?.name || "",
      role: p?.role || "operator",
      active: p?.active !== false,
      collaborator_id: c?.id || null,
      collaborator_name: c?.name || null
    };
  });
}

async function findVehicleByPlate(db: ReturnType<typeof admin>, plate: string | null) {
  if (!plate) return null;
  const r = await db.from("vehicles")
    .select("id,client_id,brand,model,plate")
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
    .eq("active", true).eq("public_enabled", true).in("id", ids)
    .order("sort_order");
  if (r.error) throw r.error;
  const addons = r.data || [];
  if (addons.length !== ids.length) throw Error("Um dos serviços extras selecionados não está disponível.");
  if (serviceId) {
    const cr = await db.from("service_addon_compatibility")
      .select("addon_id,service_id,enabled").in("addon_id", ids);
    if (cr.error) throw cr.error;
    const rows = cr.data || [];
    for (const id of ids) {
      const scoped = rows.filter((x:any) => x.addon_id === id);
      if (scoped.length && !scoped.some((x:any) => x.service_id === serviceId && x.enabled !== false)) {
        throw Error("Um dos extras selecionados não é compatível com este serviço.");
      }
    }
  }
  const rr = await db.from("service_addon_rules")
    .select("addon_id,related_addon_id,relation")
    .eq("relation","excludes").in("addon_id",ids).in("related_addon_id",ids);
  if (rr.error) throw rr.error;
  if ((rr.data || []).length) throw Error("A Hidratação dos bancos/couro já inclui a Limpeza técnica dos bancos. Escolha apenas a Hidratação.");
  return {
    ids,
    addons,
    value: addons.reduce((s:any,a:any)=>s+Number(a.price||0),0),
    duration: addons.reduce((s:any,a:any)=>s+Number(a.duration_minutes||0),0)
  };
}
async function getPublicSlots(db: ReturnType<typeof admin>, date: string, serviceId: string, vehicleId: string | null, addonIds: string[] = []) {
  const r = await db.rpc("get_available_slots_public", {
    p_date: date,
    p_service_id: serviceId,
    p_vehicle_id: vehicleId,
    p_addon_ids: addonIds
  });
  if (r.error) throw r.error;
  return (r.data || []) as Array<{ starts_at: string, local_time: string }>;
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

  if (req.method === "POST" && action === "bootstrap") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sessão ausente." }, 401);
    try {
      const au = await db.auth.getUser(token);
      if (au.error || !au.data.user) return json({ error: "Sessão inválida." }, 401);
      const user = au.data.user;
      const existing = await db.from("app_profiles")
        .select("user_id,name,role,active").eq("user_id", user.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return json({ profile: existing.data, bootstrapped: false });
      const count = await db.from("app_profiles").select("user_id", { count: "exact", head: true });
      if (count.error) throw count.error;
      if ((count.count || 0) !== 0) return json({ error: "Este usuário ainda não possui acesso ao staging." }, 403);
      const ins = await db.from("app_profiles")
        .insert({ user_id: user.id, name: String(user.email || "Owner").split("@")[0], role: "owner", active: true })
        .select("user_id,name,role,active").single();
      if (ins.error) throw ins.error;
      return json({ profile: ins.data, bootstrapped: true });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }


  if (req.method === "POST" && action === "team-access-list") {
    const auth = await requireManager(req, db);
    if (auth.error) return auth.error;
    try {
      const accounts = await listManagedAccounts(db);
      return json({ accounts });
    } catch (e) {
      return json({ error: String((e as any)?.message || e) }, 500);
    }
  }

  if (req.method === "POST" && action === "team-access-save") {
    const auth = await requireManager(req, db);
    if (auth.error) return auth.error;
    const b = await body(req);
    const collaboratorId = clean((b as any).collaborator_id, 80);
    const accessEnabled = (b as any).access_enabled === true;
    const desiredRole = normalizeAccessRole((b as any).role);
    const email = clean((b as any).email, 180).toLowerCase();
    const password = String((b as any).password || "");

    if (!collaboratorId) return json({ error: "Colaborador não informado." }, 400);
    const cr = await db.from("collaborators")
      .select("id,user_id,name,active").eq("id", collaboratorId).maybeSingle();
    if (cr.error) return json({ error: cr.error.message }, 400);
    if (!cr.data) return json({ error: "Colaborador não encontrado." }, 404);

    let userId = cr.data.user_id as string | null;
    let targetProfile: any = null;
    if (userId) {
      const pr = await db.from("app_profiles").select("user_id,name,role,active").eq("user_id", userId).maybeSingle();
      if (pr.error) return json({ error: pr.error.message }, 400);
      targetProfile = pr.data;
    }

    if (!accessEnabled) {
      if (!userId) return json({ ok: true, account: null });
      if (userId === auth.user!.id) return json({ error: "Você não pode desativar o próprio acesso." }, 400);
      if (targetProfile?.role === "owner" && auth.profile?.role !== "owner") {
        return json({ error: "Apenas o proprietário pode alterar acesso de proprietário." }, 403);
      }
      const off = await db.from("app_profiles")
        .upsert({ user_id: userId, name: cr.data.name, role: targetProfile?.role || "operator", active: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (off.error) return json({ error: off.error.message }, 400);
      const accounts = await listManagedAccounts(db);
      return json({ ok: true, account: accounts.find((x: any) => x.user_id === userId) || null });
    }

    if (!email || !email.includes("@")) return json({ error: "Informe um e-mail válido para o acesso." }, 400);
    if (!userId && password.length < 8) return json({ error: "Para criar o acesso, informe uma senha com pelo menos 8 caracteres." }, 400);
    if (password && password.length < 8) return json({ error: "A nova senha precisa ter pelo menos 8 caracteres." }, 400);
    if (desiredRole === "admin" && auth.profile?.role !== "owner") {
      return json({ error: "Apenas o proprietário pode conceder acesso de administrador." }, 403);
    }
    if (targetProfile?.role === "owner") {
      return json({ error: "O acesso de proprietário não pode ser alterado por esta tela." }, 403);
    }

    let createdNow = false;
    if (!userId) {
      const users = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (users.error) return json({ error: users.error.message }, 500);
      const existing = (users.data?.users || []).find((u: any) => String(u.email || "").toLowerCase() === email);
      if (existing) {
        const linked = await db.from("collaborators").select("id,name").eq("user_id", existing.id).neq("id", collaboratorId).maybeSingle();
        if (linked.error) return json({ error: linked.error.message }, 400);
        if (linked.data) return json({ error: "Este e-mail já está ligado a outro colaborador." }, 409);
        userId = existing.id;
      } else {
        const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
        if (created.error || !created.data.user) return json({ error: created.error?.message || "Não foi possível criar o acesso." }, 400);
        userId = created.data.user.id;
        createdNow = true;
      }
    }

    const updateAttrs: Record<string, unknown> = {};
    if (email) updateAttrs.email = email;
    if (password) updateAttrs.password = password;
    if (Object.keys(updateAttrs).length) {
      const au = await db.auth.admin.updateUserById(userId!, updateAttrs);
      if (au.error) {
        if (createdNow) await db.auth.admin.deleteUser(userId!);
        return json({ error: au.error.message }, 400);
      }
    }

    const profile = await db.from("app_profiles")
      .upsert({
        user_id: userId,
        name: cr.data.name,
        role: desiredRole,
        active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
    if (profile.error) {
      if (createdNow) await db.auth.admin.deleteUser(userId!);
      return json({ error: profile.error.message }, 400);
    }

    const link = await db.from("collaborators")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", collaboratorId);
    if (link.error) {
      if (createdNow) await db.auth.admin.deleteUser(userId!);
      return json({ error: link.error.message }, 400);
    }

    const accounts = await listManagedAccounts(db);
    return json({ ok: true, account: accounts.find((x: any) => x.user_id === userId) || null });
  }

  if (req.method === "POST" && action === "create-public-link") {
    const auth = await requireManager(req, db);
    if (auth.error) return auth.error;
    const b = await body(req);
    const allowSameDay = b.allow_same_day !== false;
    const clientId = clean(b.client_id, 80) || null;
    if (clientId) {
      const cr = await db.from("clients").select("id").eq("id", clientId).is("archived_at", null).maybeSingle();
      if (cr.error || !cr.data) return json({ error: "Cliente não encontrado." }, 400);
    }
    const ins = await db.from("public_booking_links")
      .insert({ client_id: clientId, allow_same_day: allowSameDay, active: true, created_by: auth.user!.id })
      .select("token,client_id,allow_same_day,created_at").single();
    if (ins.error) return json({ error: ins.error.message }, 500);
    return json({ link: ins.data });
  }

  if (req.method === "GET" && action === "public-config") {
    const token = clean(u.searchParams.get("token"), 80);
    const link = await linkByToken(db, token);
    if (!link) return json({ error: "Link inválido ou inativo." }, 404);
    const [s, b, m, ax, arules, acompat] = await Promise.all([
      db.from("services").select("id,name,category,price,price_pm,price_g,size_pricing_enabled,duration_minutes,booking_mode,first_slot_time")
        .eq("active", true).order("name"),
      db.from("vehicle_brands").select("id,name").eq("active", true).order("name"),
      db.from("vehicle_models").select("id,brand_id,name").eq("active", true).order("name"),
      db.from("service_addons").select("id,name,description,price,duration_minutes,sort_order")
        .eq("active",true).eq("public_enabled",true).order("sort_order"),
      db.from("service_addon_rules").select("addon_id,related_addon_id,relation"),
      db.from("service_addon_compatibility").select("addon_id,service_id,enabled")
    ]);
    if (s.error || b.error || m.error || ax.error || arules.error || acompat.error) return json({ error: "Não foi possível carregar o agendamento." }, 500);

    let client = null;
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
        client = {
          id: cr.data.id,
          name: cr.data.name,
          address: cr.data.address || "",
          condominium
        };
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
    const added = completed.count || 0;
    const waterSaved = baseSaved + (added * 190);

    return json({
      allow_same_day: link.allow_same_day,
      today: spDate(0),
      personalized: !!client,
      client,
      vehicles,
      services: s.data || [],
      addons: ax.data || [],
      addon_rules: arules.data || [],
      addon_compatibility: acompat.data || [],
      brands: b.data || [],
      models: m.data || [],
      water_savings: {
        total_liters: waterSaved,
        conventional_liters_per_car: 200,
        vaporeasy_liters_per_car: 10,
        saved_liters_per_service: 190,
        base_liters: baseSaved
      }
    });
  }

  if (req.method === "POST" && action === "public-dates") {
    const b = await body(req);
    const token = clean(b.token, 80);
    const serviceId = clean(b.service_id, 80);
    const plate = normalizePlate(b.plate);
    let addonSelection;
    try { addonSelection = await getPublicAddonSelection(db, b.addon_ids, serviceId); }
    catch (e) { return json({ error: String(e?.message || e) }, 400); }
    const requestedVehicleId = clean(b.vehicle_id, 80) || null;
    const link = await linkByToken(db, token);
    if (!link) return json({ error: "Link inválido ou inativo." }, 404);
    let vehicle = null;
    if (requestedVehicleId && link.client_id) {
      const vr = await db.from("vehicles").select("id,client_id,brand,model,plate,package_size")
        .eq("id", requestedVehicleId).eq("client_id", link.client_id).is("archived_at", null).maybeSingle();
      vehicle = vr.data || null;
    }
    if (!vehicle && link.client_id && plate) {
      const byPlate = await findVehicleByPlate(db, plate);
      if (byPlate?.client_id === link.client_id) vehicle = byPlate;
    }
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
        const future = slots.filter(x => new Date(x.starts_at).getTime() > Date.now());
        if (!future.length) dates = dates.filter((d: string) => d !== spDate(0));
      } catch {}
    }
    return json({ dates });
  }

  if (req.method === "POST" && action === "public-slots") {
    const b = await body(req);
    const token = clean(b.token, 80);
    const serviceId = clean(b.service_id, 80);
    const date = clean(b.date, 10);
    const plate = normalizePlate(b.plate);
    let addonSelection;
    try { addonSelection = await getPublicAddonSelection(db, b.addon_ids, serviceId); }
    catch (e) { return json({ error: String(e?.message || e) }, 400); }
    const requestedVehicleId = clean(b.vehicle_id, 80) || null;
    const link = await linkByToken(db, token);
    if (!link) return json({ error: "Link inválido ou inativo." }, 404);
    if (!validDateForLink(date, !!link.allow_same_day)) return json({ error: "Data não permitida por este link." }, 400);
    let vehicle = null;
    if (requestedVehicleId && link.client_id) {
      const vr = await db.from("vehicles").select("id,client_id,brand,model,plate")
        .eq("id", requestedVehicleId).eq("client_id", link.client_id).is("archived_at", null).maybeSingle();
      vehicle = vr.data || null;
    }
    if (!vehicle && link.client_id && plate) {
      const byPlate = await findVehicleByPlate(db, plate);
      if (byPlate?.client_id === link.client_id) vehicle = byPlate;
    }
    try {
      let slots = await getPublicSlots(db, date, serviceId, vehicle?.id || null, addonSelection.ids);
      if (date === spDate(0)) slots = slots.filter(x => new Date(x.starts_at).getTime() > Date.now());
      return json({ slots });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 400);
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
    if (packageSize && packageSize !== "pm" && packageSize !== "g") {
      return json({ error: "Porte do veículo inválido." }, 400);
    }
    const notes = clean(b.notes, 500);
    const serviceId = clean(b.service_id, 80);
    const date = clean(b.date, 10);
    const localTime = clean(b.local_time, 5);
    const plate = normalizePlate(b.plate);
    const requestId = clean(b.request_id, 80) || crypto.randomUUID();
    const requestedVehicleId = clean(b.vehicle_id, 80) || null;
    const idem = "public:" + token + ":" + requestId;

    const previous = await db.from("appointments")
      .select("id,status,starts_at,service_id")
      .eq("idempotency_key", idem)
      .maybeSingle();
    if (previous.error) return json({ error: "Não foi possível verificar a reserva anterior." }, 500);
    if (previous.data) {
      return json({
        ok: true,
        appointment: previous.data,
        requires_confirmation: previous.data.status === "requested",
        reused: true
      });
    }

    let addonSelection;
    try { addonSelection = await getPublicAddonSelection(db, b.addon_ids, serviceId); }
    catch (e) { return json({ error: String(e?.message || e) }, 400); }

    if (!serviceId || !date || !localTime) {
      return json({ error: "Selecione serviço, data e horário." }, 400);
    }
    if (!link.client_id && (!name || !phone)) {
      return json({ error: "Preencha nome e contato." }, 400);
    }
    if (!validDateForLink(date, !!link.allow_same_day)) {
      return json({ error: "Essa data não está disponível neste link." }, 400);
    }

    const sr = await db.from("services")
      .select("id,name,price,price_pm,price_g,size_pricing_enabled,duration_minutes,booking_mode,active")
      .eq("id", serviceId).eq("active", true).maybeSingle();
    if (sr.error || !sr.data) return json({ error: "Serviço indisponível." }, 400);
    const service = sr.data;

    let existingVehicle = await findVehicleByPlate(db, plate);
    if (!link.client_id && existingVehicle) {
      return json({
        error: "Esta placa já possui cadastro. Solicite à Vaporeasy um link personalizado para este veículo."
      }, 409);
    }
    if (link.client_id && existingVehicle && existingVehicle.client_id !== link.client_id) {
      return json({
        error: "Esta placa já está vinculada a outro cadastro. Fale com a Vaporeasy para conferência."
      }, 409);
    }

    let clientId: string | null = link.client_id || null;
    let vehicleId: string | null = null;

    if (link.client_id && requestedVehicleId) {
      const vr = await db.from("vehicles").select("id,client_id,brand,model,plate")
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

      if (!vehicleId) {
        if (!brand || !model) return json({ error: "Informe montadora e modelo do veículo." }, 400);
        const vi = await db.from("vehicles").insert({
          client_id: clientId, brand, model, plate, year, color, package_size: packageSize || null,
          notes: "Veículo cadastrado pelo agendamento público."
        }).select("id").single();
        if (vi.error) {
          if (vi.error.code === "23505" && plate) {
            existingVehicle = await findVehicleByPlate(db, plate);
            if (existingVehicle && existingVehicle.client_id === clientId) {
              vehicleId = existingVehicle.id;
            } else {
              return json({ error: "Esta placa já está vinculada a outro cadastro. Fale com a Vaporeasy para conferência." }, 409);
            }
          } else return json({ error: vi.error.message }, 400);
        } else vehicleId = vi.data.id;
      }
    }

    if (clientId && !vehicleId) {
      if (!brand || !model) return json({ error: "Selecione um veículo cadastrado ou informe um novo veículo." }, 400);
      if (plate) {
        const samePlate = await findVehicleByPlate(db, plate);
        if (samePlate && samePlate.client_id !== clientId) {
          return json({ error: "Esta placa já está vinculada a outro cadastro. Fale com a Vaporeasy para conferência." }, 409);
        }
        if (samePlate && samePlate.client_id === clientId) vehicleId = samePlate.id;
      }
      if (!vehicleId) {
        const vi = await db.from("vehicles").insert({
          client_id: clientId, brand, model, plate, year, color, package_size: packageSize || null,
          notes: "Veículo cadastrado pelo agendamento público."
        }).select("id").single();
        if (vi.error) return json({ error: vi.error.message }, 400);
        vehicleId = vi.data.id;
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

    let slots: Array<{starts_at:string,local_time:string}>;
    try {
      slots = await getPublicSlots(db, date, serviceId, vehicleId, addonSelection.ids);
      if (date === spDate(0)) slots = slots.filter(x => new Date(x.starts_at).getTime() > Date.now());
    } catch (e) {
      return json({ error: String(e?.message || e) }, 400);
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
        const prev = await db.from("appointments").select("id,status,starts_at").eq("idempotency_key", idem).maybeSingle();
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
