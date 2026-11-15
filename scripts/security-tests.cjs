const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Run the real TypeScript handlers with only external auth/database calls mocked.
const cache = new Map();
let account = { id: 'admin-id', email: 'admin@example.test', role: 'admin', sessionId: 'session-a' };
let created;
let updated;
let targetRole = 'totem';
let passwordValid = true;
let signOutScope;
let authUser = null;
const overrides = {
  'server-only': {},
  '@/lib/server/request-auth': { getVerifiedAccount: async () => account },
  '@supabase/ssr': { createServerClient: () => ({ auth: {
    getUser: async () => ({ data: { user: authUser }, error: null }),
    getSession: async () => ({ data: { session: { access_token: `header.${Buffer.from(JSON.stringify({ session_id: 'session-a' })).toString('base64url')}.signature` } } }),
  } }) },
  '@/lib/server/supabase-admin': { supabaseAdmin: { auth: { admin: {
    createUser: async (data) => { created = data; return { error: null }; },
    listUsers: async () => ({ data: { users: [{ id: 'u', email: 'u@example.test', app_metadata: { role: 'totem', secret: 'hidden' }, user_metadata: { name: 'Equipe' } }], nextPage: null }, error: null }),
    getUserById: async () => ({ data: { user: { app_metadata: { role: targetRole } } }, error: null }),
    updateUserById: async (id, data) => { updated = { id, ...data }; return { error: null }; },
  } } } },
  '@supabase/supabase-js': { createClient: () => ({ auth: {
    signInWithPassword: async () => ({ data: { user: passwordValid ? { id: account.id, app_metadata: { role: 'admin' } } : null }, error: passwordValid ? null : new Error('invalid') }),
    signOut: async ({ scope }) => { signOutScope = scope; return { error: null }; },
  } }) },
};
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const customRequire = (id) => Object.hasOwn(overrides, id) ? overrides[id] : id.startsWith('@/') ? load(`${id.slice(2)}.ts`) : require(id);
  new Function('require', 'module', 'exports', code)(customRequire, module, module.exports);
  cache.set(absolute, module.exports);
  return module.exports;
}
process.env.SUPABASE_SECRET_KEY = 'test-only-secret-not-a-real-credential';
process.env.VERCEL = '0';
const grants = load('lib/server/admin-grant.ts');
const security = load('lib/server/request-security.ts');
const routes = load('app/api/admin/usuarios/route.ts');
const confirm = load('app/api/admin/usuarios/confirmar/route.ts');
const { csvCell } = load('lib/csv.ts');
const request = (method, body, token, origin = 'http://localhost:3000', query = '') => new NextRequest(`http://localhost:3000/api/admin/usuarios${query}`, {
  method, headers: { origin, 'Content-Type': 'application/json', ...(token ? { 'x-admin-grant': token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

(async () => {
  const token = grants.issueAdminGrant(account.id, account.sessionId);
  const payload = { name: "Equipe'; DROP TABLE users;--", email: 'equipe@example.test', password: 'test-only-long-password', role: 'totem' };
  await test('grant is bound to account, session, integrity and expiry', () => {
    assert.equal(grants.verifyAdminGrant(token, account.id, account.sessionId), true);
    assert.equal(grants.verifyAdminGrant(token, 'other', account.sessionId), false);
    assert.equal(grants.verifyAdminGrant(token, account.id, 'other-session'), false);
    assert.equal(grants.verifyAdminGrant(`${token}x`, account.id, account.sessionId), false);
    assert.equal(grants.verifyAdminGrant(token, account.id, account.sessionId, Date.now() + 301000), false);
    assert.equal(grants.verifyAdminGrant('x'.repeat(3000), account.id, account.sessionId), false);
  });
  await test('anonymous, totem, cantina and manager cannot manage users', async () => {
    const original = account;
    for (const role of [null, 'totem', 'cantina', 'manager']) {
      account = role ? { ...original, role } : null;
      assert.equal((await routes.GET(request('GET', undefined, token))).status, 403);
      assert.equal((await routes.POST(request('POST', payload, token))).status, 403);
      assert.equal((await routes.PATCH(request('PATCH', { id: 'x', role: 'totem' }, token))).status, 403);
    }
    account = original;
  });
  await test('admin without password confirmation cannot list or create', async () => {
    assert.equal((await routes.GET(request('GET'))).status, 401);
    assert.equal((await routes.POST(request('POST', payload))).status, 401);
  });
  await test('foreign origin blocked before mutation', async () => {
    assert.equal((await routes.POST(request('POST', payload, token, 'https://evil.test'))).status, 403);
    assert.equal(created, undefined);
  });
  await test('role escalation and short passwords rejected', async () => {
    for (const body of [{ ...payload, role: 'admin' }, { ...payload, role: 'manager' }, { ...payload, password: 'short' }, null]) {
      assert.equal((await routes.POST(request('POST', body, token))).status, 400);
    }
  });
  await test('SQL-looking name stays data; client metadata cannot grant admin', async () => {
    const response = await routes.POST(request('POST', { ...payload, app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } }, token));
    assert.equal(response.status, 201);
    assert.equal(created.user_metadata.name, payload.name);
    assert.deepEqual(created.app_metadata, { role: 'totem' });
    assert.equal(JSON.stringify(await response.json()).includes(payload.password), false);
  });
  await test('cantina creation supported', async () => {
    assert.equal((await routes.POST(request('POST', { ...payload, role: 'cantina' }, token))).status, 201);
    assert.deepEqual(created.app_metadata, { role: 'cantina' });
  });
  await test('list is no-store and omits auth metadata', async () => {
    const response = await routes.GET(request('GET', undefined, token));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys((await response.json()).users[0]).sort(), ['editable', 'email', 'id', 'name', 'role']);
    assert.equal((await routes.GET(request('GET', undefined, token, undefined, '?page=-1'))).status, 400);
  });
  await test('only operational accounts can have roles changed', async () => {
    const body = { id: '12345678-1234-4234-8234-123456789abc', role: 'cantina' };
    targetRole = 'admin';
    assert.equal((await routes.PATCH(request('PATCH', body, token))).status, 403);
    assert.equal(updated, undefined);
    targetRole = 'totem';
    assert.equal((await routes.PATCH(request('PATCH', body, token))).status, 200);
    assert.deepEqual(updated.app_metadata, { role: 'cantina' });
    assert.equal((await routes.PATCH(request('PATCH', { ...body, role: 'admin' }, token))).status, 400);
  });
  await test('wrong password never unlocks; correct password revokes temporary session', async () => {
    passwordValid = false;
    assert.equal((await confirm.POST(request('POST', { password: 'wrong' }))).status, 401);
    passwordValid = true;
    const response = await confirm.POST(request('POST', { password: 'valid-test-only' }));
    assert.equal(response.status, 200);
    assert.equal(signOutScope, 'local');
    assert.equal(grants.verifyAdminGrant((await response.json()).token, account.id, account.sessionId), true);
  });
  await test('confirmation attempts rate limited', async () => {
    passwordValid = false;
    for (let i = 0; i < 3; i++) await confirm.POST(request('POST', { password: 'wrong' }));
    assert.equal((await confirm.POST(request('POST', { password: 'wrong' }))).status, 429);
  });
  await test('body limit enforced without Content-Length', async () => {
    await assert.rejects(() => security.readJsonBody(request('POST', { value: 'x'.repeat(17000) })));
    assert.deepEqual(await security.readJsonBody(request('POST', { value: 'ok' })), { value: 'ok' });
  });
  await test('CSV quotes delimiters and neutralizes formulas', () => {
    assert.equal(csvCell('a;"b'), '"a;""b"');
    assert.equal(csvCell('=HYPERLINK("bad")').startsWith('"\''), true);
    assert.equal(csvCell('  +cmd').startsWith('"\''), true);
  });
  await test('server authorization ignores user-editable metadata', async () => {
    const auth = load('lib/server/request-auth.ts');
    authUser = { id: 'u', app_metadata: { role: 'totem' }, user_metadata: { role: 'admin' } };
    assert.equal(await auth.requireStaff(request('GET')), null);
    assert.equal((await auth.requireTotem(request('GET'))).role, 'totem');
    authUser.app_metadata.role = 'cantina';
    assert.equal((await auth.requireStaff(request('GET'))).role, 'cantina');
    assert.equal(await auth.requireTotem(request('GET')), null);
    authUser.app_metadata.role = 'unknown';
    assert.equal(await auth.requireStaff(request('GET')), null);
  });
  await test('real proxy separates cantina, totem and admin pages', async () => {
    const { proxy } = load('proxy.ts');
    for (const [role, allowed, denied, home] of [
      ['cantina', ['/caixa', '/cozinha'], ['/admin', '/totem'], '/caixa'],
      ['totem', ['/totem'], ['/admin', '/caixa', '/cozinha'], '/totem'],
      ['admin', ['/admin', '/caixa', '/cozinha'], ['/totem'], '/admin'],
    ]) {
      authUser = { id: 'u', app_metadata: { role } };
      for (const url of allowed) assert.equal((await proxy(new NextRequest(`http://localhost:3000${url}`))).status, 200);
      for (const url of denied) assert.equal((await proxy(new NextRequest(`http://localhost:3000${url}`))).headers.get('location'), `http://localhost:3000${home}`);
    }
    authUser = null;
    assert.equal((await proxy(new NextRequest('http://localhost:3000/admin'))).headers.get('location'), 'http://localhost:3000/login');
  });
  console.log(`${passed} security checks passed. Auth/database are mocked; no real accounts were created.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
