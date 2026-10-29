import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0005_clients_insert_review_only.sql', import.meta.url), 'utf8');

test('client insert migration remains scoped to the isolated schema', () => {
  assert.match(sql, /on vaporize_next\.clients\s+for insert to authenticated/i);
  assert.match(sql, /grant insert \(organization_id, name, phone\) on vaporize_next\.clients to authenticated/i);
  assert.doesNotMatch(sql, /\b(?:alter|drop|truncate|delete from|update)\s+(?:table\s+)?public\./i);
});

test('client insert requires active owner or manager membership in active organization', () => {
  assert.match(sql, /m\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql, /m\.organization_id\s*=\s*p_organization_id/i);
  assert.match(sql, /m\.role\s+in\s*\('owner',\s*'manager'\)/i);
  assert.match(sql, /m\.status\s*=\s*'active'/i);
  assert.match(sql, /o\.status\s*=\s*'active'/i);
  assert.match(sql, /with check\s*\(vaporize_next\.can_manage_clients\(organization_id\)\)/i);
});

test('authorization predicate has fixed search path and no anonymous execution grant', () => {
  assert.match(sql, /security definer\s+set search_path\s*=\s*''/i);
  assert.match(sql, /revoke all on function vaporize_next\.can_manage_clients\(uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function vaporize_next\.can_manage_clients\(uuid\) to authenticated, service_role/i);
});
