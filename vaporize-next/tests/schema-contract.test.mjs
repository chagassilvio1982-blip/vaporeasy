import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase/migrations/0001_multiempresa_base.sql', import.meta.url), 'utf8');

test('vehicle belongs to same organization as its client via composite foreign key', () => {
  assert.match(schema, /unique\s*\(id\s*,\s*organization_id\s*\)/i);
  assert.match(schema, /constraint\s+next_vehicle_client_same_org\s+foreign\s+key\s*\(client_id\s*,\s*organization_id\s*\)\s*references\s+vaporize_next\.clients\s*\(id\s*,\s*organization_id\s*\)/i);
});

test('all four tenant tables have row-level security enabled', () => {
  for (const table of ['organizations', 'memberships', 'clients', 'vehicles']) {
    assert.match(schema, new RegExp('alter\\s+table\\s+vaporize_next\\.' + table + '\\s+enable\\s+row\\s+level\\s+security', 'i'));
  }
});

test('clients and vehicles are read-only for authenticated role', () => {
  assert.match(schema, /grant\s+select\s+on\s+vaporize_next\.organizations\s*,\s*vaporize_next\.memberships\s*,\s*vaporize_next\.clients\s*,\s*vaporize_next\.vehicles\s+to\s+authenticated/i);
  assert.doesNotMatch(schema, /grant\s+(?:all|insert|update|delete)\s+on\s+(?:table\s+)?vaporize_next\.(?:clients|vehicles)\s+to\s+authenticated/i);
});

test('RLS tenant read policies invoke membership check', () => {
  for (const table of ['organizations', 'memberships', 'clients', 'vehicles']) {
    assert.match(schema, new RegExp('create\\s+policy\\s+next_\\w+_read\\s+on\\s+vaporize_next\\.' + table + '[\\s\\S]*?using\\s*\\(vaporize_next\\.is_member\\(', 'i'));
  }
});
