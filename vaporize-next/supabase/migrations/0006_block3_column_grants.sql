-- Restrict authenticated edits to business fields only.
-- Tenant and client identity columns cannot be changed by the browser API.
revoke update on vaporize_next.vehicles from authenticated;
revoke update on vaporize_next.clients from authenticated;
grant update (brand, model, plate) on vaporize_next.vehicles to authenticated;
grant update (name, phone) on vaporize_next.clients to authenticated;
