import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('page loads isolated config before auth module', () => {
  const html = read('../index.html');
  const config = html.indexOf('src="./src/ui/config.js"');
  const main = html.indexOf('src="./src/ui/main.js"');
  assert.ok(config >= 0 && main > config);
  assert.match(html, /id="recovery-form" hidden/);
  assert.match(html, /id="workspace" hidden/);
});

test('public browser config targets only Next and never contains admin key', () => {
  const config = read('../src/ui/config.js');
  assert.match(config, /cfpvexgkjsqpwhebsoos\.supabase\.co/);
  assert.doesNotMatch(config, /service_role|sb_secret_/i);
  assert.doesNotMatch(config, /asuppjeomaymzromgcrp/);
});

test('UI starts in fail-closed mode and does not import V2', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /if \(!config\?\.supabaseUrl \|\| !config\?\.supabaseAnonKey\)/);
  assert.match(main, /persistSession: true/);
  assert.match(main, /flowType: 'pkce'/);
  assert.match(main, /createEphemeralPkceStorage\(sessionStorage\)/);
  assert.match(main, /detectSessionInUrl: false/);
  assert.doesNotMatch(main, /\/v2\/|asuppjeomaymzromgcrp/);
});

test('workspace is hidden when tenant authorization is revoked', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /controller\.subscribe\(\(\{ recovering, internalAccess \}\)/);
  assert.match(main, /!internalAccess && !\$\('workspace'\)\.hidden/);
  assert.match(main, /Acesso empresarial revogado/);
});

test('denied tenant authorization signs out locally before reporting blocked access', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /if \(!await controller\.requireInternalAccess\(\)\) \{/);
  assert.match(main, /controller\.clearAccess\(\);\s*try \{ await supabase\.auth\.signOut\(\{ scope: 'local' \}\); \}/);
});
