"use strict";
/**
 * V2 billing eligibility, pure module. No database writes.
 * A recurring schedule alone NEVER proves package coverage.
 * Inputs must come from the same client and competence.
 */
function billingCoverage(appointment, subscriptions, charges, competence) {
  const rawDate=String(appointment.starts_at||"");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ?rawDate.slice(0,7)
    :rawDate && !Number.isNaN(Date.parse(rawDate))
      ?(()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).formatToParts(new Date(rawDate));return parts.find(p=>p.type==="year").value+"-"+parts.find(p=>p.type==="month").value})()
      :"";
  if (date !== competence) return { kind: "out_of_period", billable: false };
  const matching = (subscriptions || []).filter(s =>
    s.client_id === appointment.client_id &&
    s.vehicle_id === appointment.vehicle_id &&
    s.service_id === appointment.service_id &&
    s.recurring_plan_id === appointment.recurring_plan_id &&
    String(s.starts_on || "").slice(0, 7) <= competence &&
    (!s.superseded_at || String(s.superseded_at).slice(0, 7) >= competence)
  );
  const covered = matching.some(s => (charges || []).some(c =>
    c.subscription_id === s.id &&
    String(c.competence_month).slice(0, 7) === competence &&
    (c.status === "pending" || c.status === "paid")
  ));
  if (covered) return { kind: "included_in_plan", billable: false };
  return { kind: "review_required", billable: false };
}
function validateBillingSelection(lines, context = {}) {
  const seen = new Set();
  let total = 0;
  for (const line of lines) {
    if (!line || !["package_charge", "appointment_extra"].includes(line.kind)) throw Error("Tipo de cobrança inválido");
    if (!line.id || seen.has(line.kind + ":" + line.id)) throw Error("Item duplicado");
    if (context.client_id && line.client_id !== context.client_id) throw Error("Cliente divergente");
    if (context.competence && String(line.competence_month || "").slice(0, 7) !== context.competence) throw Error("Competência divergente");
    if (line.kind === "appointment_extra" && line.coverage_verified !== true) throw Error("Cobertura do serviço não verificada");
    seen.add(line.kind + ":" + line.id);
    if (line.status === "paid" || line.status === "cancelled" || line.covered_by_plan) throw Error("Item indisponível para cobrança");
    if (!Number.isFinite(line.amount) || line.amount < 0) throw Error("Valor inválido");
    total += line.amount;
  }
  return Math.round(total * 100) / 100;
}
if (typeof module !== "undefined") module.exports = { billingCoverage, validateBillingSelection };
if (typeof window !== "undefined") { window.billingCoverage = billingCoverage; window.validateBillingSelection = validateBillingSelection; }
