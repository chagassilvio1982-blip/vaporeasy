/** Vaporeasy Next / Bloco 3: consulta de veículos, sem escrita. */
const HOST = 'cfpvexgkjsqpwhebsoos.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function vehicleQuery({ organizationId, clientId, limit = 50 }) {
  if (!UUID.test(organizationId)) throw new TypeError('organizationId inválido');
  if (clientId != null && !UUID.test(clientId)) throw new TypeError('clientId inválido');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit fora do intervalo 1–100');
  const params = new URLSearchParams();
  params.set('select', 'id,organization_id,client_id,brand,model,plate,created_at');
  params.set('organization_id', 'eq.' + organizationId);
  if (clientId) params.set('client_id', 'eq.' + clientId);
  params.set('order', 'created_at.desc');
  params.set('limit', String(limit));
  return params;
}

export async function listVehicles({ supabaseUrl, publishableKey, accessToken, organizationId, clientId, limit = 50, fetchImpl = fetch }) {
  const base = new URL(supabaseUrl);
  if (base.protocol !== 'https:' || base.hostname !== HOST || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
    throw new TypeError('Somente homologação isolada autorizada');
  }
  if (typeof publishableKey !== 'string' || !publishableKey.startsWith('sb_publishable_')) throw new TypeError('Chave pública inválida');
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw new TypeError('Sessão obrigatória');
  const url = new URL('/rest/v1/vehicles', base);
  url.search = vehicleQuery({ organizationId, clientId, limit }).toString();
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, 'Accept-Profile': 'vaporize_next' },
    redirect: 'error'
  });
  if (!response.ok) throw new Error('Consulta de veículos falhou: HTTP ' + response.status);
  const vehicles = await response.json();
  if (!Array.isArray(vehicles) || vehicles.some(v => v.organization_id !== organizationId || (clientId && v.client_id !== clientId))) {
    throw new Error('Resposta de veículos fora do escopo solicitado');
  }
  return vehicles;
}
