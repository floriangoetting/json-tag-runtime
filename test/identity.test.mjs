import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJsonTag } from '../dist/browser/index.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const payload = () => ({ event: { name: 'click' }, device: { category: 'desktop' } });
const tag = (options = {}) => createJsonTag({ browser_context: false, transport: async () => ({ accepted: true }), ...options, identity: options.identity ? { storage: 'localStorage', ...options.identity } : undefined });
const event = async (runtime, input = payload()) => (await runtime.send(input)).event;
function storage(t, blocked = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  let reads = 0;
  let writes = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key) { reads++; if (blocked) throw new Error('denied'); return data.get(key) ?? null; },
    setItem(key, value) { writes++; if (blocked) throw new Error('denied'); data.set(key, value); },
    removeItem(key) { if (blocked) throw new Error('denied'); data.delete(key); },
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage);
  return { data, counts: () => [reads, writes] };
}

test('identity is opt-in and storage is untouched before consent', async (t) => {
  const store = storage(t);
  for (const runtime of [tag(), tag({ identity: { enabled: true } })]) {
    const result = await event(runtime);
    assert.equal(result.device.id, undefined);
    assert.equal(result.session, undefined);
  }
  assert.deepEqual(store.counts(), [0, 0]);
  const runtime = tag({ identity: { enabled: true } });
  runtime.setIdentityConsent(true);
  assert.match((await event(runtime)).device.id, uuid);
});

test('device survives reload, preserves fields and leaves sessions off', async (t) => {
  storage(t);
  const options = { identity: { enabled: true, consent: true } };
  const first = await event(tag(options));
  const second = await event(tag(options));
  assert.match(first.device.id, uuid);
  assert.equal(first.device.id, second.device.id);
  assert.equal(first.device.category, 'desktop');
  assert.equal(first.session, undefined);
  assert.notEqual(first.event.id, second.event.id);
  const isolated = await event(tag({ identity: { ...options.identity, storage_key: 'another-environment' } }));
  assert.notEqual(isolated.device.id, first.device.id);
});

test('optional UUID sessions renew after inactivity, device changes and clock rollback', async (t) => {
  storage(t);
  let time = Date.UTC(2026, 0, 1);
  const options = { now: () => new Date(time), identity: { enabled: true, consent: true, session: { enabled: true, inactivity_minutes: 30 } } };
  const first = await event(tag(options));
  assert.match(first.session.id, uuid);
  time += 29 * 60000;
  const active = await event(tag(options));
  assert.equal(active.session.id, first.session.id);
  time += 30 * 60000;
  const expired = await event(tag(options));
  assert.notEqual(expired.session.id, first.session.id);
  assert.equal(expired.device.id, first.device.id);
  const changed = await event(tag(options), { ...payload(), device: { id: 'external-device' } });
  assert.notEqual(changed.session.id, expired.session.id);
  time -= 1;
  const rollback = await event(tag(options), { ...payload(), device: { id: 'external-device' } });
  assert.notEqual(rollback.session.id, changed.session.id);
});

test('supplied IDs including timestamp sessions are preserved without mutation', async (t) => {
  const store = storage(t);
  const runtime = tag({ identity: { enabled: true, consent: true, session: { enabled: true } } });
  const input = { event: { name: 'click' }, device: { id: 'json-client-device' }, session: { id: 1700000000 } };
  const original = structuredClone(input);
  const result = await event(runtime, input);
  assert.deepEqual(input, original);
  assert.equal(result.device.id, input.device.id);
  assert.equal(result.session.id, input.session.id);
  assert.deepEqual(store.counts(), [0, 0]);
});

test('revocation and reset remove owned state and regenerate only after consent', async (t) => {
  const store = storage(t);
  store.data.set('unrelated', 'keep');
  const runtime = tag({ identity: { enabled: true, consent: true, session: { enabled: true } } });
  const first = await event(runtime);
  runtime.setIdentityConsent(false);
  assert.equal(store.data.has('json_tag_identity_v1'), false);
  assert.equal((await event(runtime)).device.id, undefined);
  runtime.setIdentityConsent(true);
  const second = await event(runtime);
  assert.notEqual(second.device.id, first.device.id);
  assert.notEqual(second.session.id, first.session.id);
  runtime.resetIdentity();
  assert.notEqual((await event(runtime)).device.id, second.device.id);
  assert.equal(store.data.get('unrelated'), 'keep');
});

test('blocked storage falls back to instance memory without breaking sends', async (t) => {
  storage(t, true);
  const runtime = tag({ identity: { enabled: true, consent: true } });
  const first = await event(runtime);
  assert.equal((await event(runtime)).device.id, first.device.id);
  runtime.resetIdentity();
  assert.notEqual((await event(runtime)).device.id, first.device.id);
});

test('corrupt state is replaced and invalid inactivity limits are rejected', async (t) => {
  const store = storage(t);
  store.data.set('json_tag_identity_v1', '{bad JSON');
  assert.match((await event(tag({ identity: { enabled: true, consent: true } }))).device.id, uuid);
  for (const value of [0, -1, 1.5, 1441, NaN]) {
    assert.throws(() => tag({ identity: { session: { inactivity_minutes: value } } }), /inactivity_minutes/);
  }
});

test('concurrent instances share identity and flush waits for pending Web Lock work', async (t) => {
  storage(t);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let queue = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request(_key, callback) { const result = queue.then(callback); queue = result.catch(() => {}); return result; },
  } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'navigator', previous) : delete globalThis.navigator);
  const options = { identity: { enabled: true, consent: true, session: { enabled: true } }, batch: { enabled: true, delay: 60000 } };
  const first = tag(options);
  const second = tag(options);
  const sends = [first.send(payload()), second.send(payload())];
  assert.equal(first.pending(), 1);
  const flushed = await Promise.all([first.flush(), second.flush()]);
  const results = await Promise.all(sends);
  assert.equal(results[0].event.device.id, results[1].event.device.id);
  assert.equal(results[0].event.session.id, results[1].event.session.id);
  assert.equal(flushed[0].sent, 1);
  assert.equal(flushed[1].sent, 1);
  assert.equal(first.pending(), 0);
});

function cookies(t, blocked = false) {
  const descriptors = ['document', 'location'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const jar = new Map();
  const writes = [];
  let reads = 0;
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'shop.example.com', protocol: 'https:' } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    get cookie() { reads++; return [...jar].map(([key, value]) => `${key}=${value}`).join('; '); },
    set cookie(value) { writes.push(value); if (blocked) return; const [pair] = value.split(';'); const index = pair.indexOf('='); const key = pair.slice(0, index); if (value.includes('Max-Age=0;')) jar.delete(key); else jar.set(key, pair.slice(index + 1)); }
  } });
  t.after(() => { for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  return { jar, writes, reads: () => reads };
}

test('cookie identity discovers parent scope only after consent', async (t) => {
  const store = cookies(t);
  const runtime = createJsonTag({ browser_context: false, transport: async () => ({ accepted: true }), identity: { enabled: true } });
  assert.equal((await event(runtime)).device.id, undefined);
  assert.equal(store.reads(), 0);
  assert.equal(store.writes.length, 0);
  runtime.setIdentityConsent(true);
  const first = await event(runtime);
  assert.match(first.device.id, uuid);
  assert.match(store.writes.at(-1), /Max-Age=31536000; Path=\/; SameSite=Lax; Domain=example.com; Secure$/);
  assert.equal([...store.jar.keys()].some((key) => key.includes('_domain_probe_')), false);
  assert.equal(first.session, undefined);
});

test('configured cookie domain is shared by instances and reset deletes the same scope', async (t) => {
  const store = cookies(t);
  const options = { identity: { storage: 'cookie', enabled: true, consent: true, cookie: { domain: '.example.com', max_age_seconds: 86400 } } };
  const first = await event(tag(options));
  globalThis.location.hostname = 'www.example.com';
  const second = tag(options);
  assert.equal((await event(second)).device.id, first.device.id);
  assert.match(store.writes[0], /Max-Age=86400; Path=\/; SameSite=Lax; Domain=example.com; Secure$/);
  second.setIdentityConsent(false);
  assert.match(store.writes.at(-1), /Max-Age=0; Path=\/; SameSite=Lax; Domain=example.com; Secure$/);
  assert.equal(store.jar.size, 0);
});

test('blocked cookies use memory and invalid domains or lifetimes are rejected', async (t) => {
  cookies(t, true);
  const runtime = tag({ identity: { storage: 'cookie', enabled: true, consent: true } });
  const first = await event(runtime);
  assert.equal((await event(runtime)).device.id, first.device.id);
  runtime.resetIdentity();
  assert.notEqual((await event(runtime)).device.id, first.device.id);
  for (const domain of ['other.com', 'example.com; Secure', 'badexample.com']) assert.throws(() => tag({ identity: { cookie: { domain } } }), /cookie.domain/);
  for (const max_age_seconds of [0, -1, 1.5, 34560001]) assert.throws(() => tag({ identity: { cookie: { max_age_seconds } } }), /max_age_seconds/);
});

test('explicit host-only cookies do not probe and withdrawal before first send only deletes', async (t) => {
  const store = cookies(t);
  const runtime = tag({ identity: { storage: 'cookie', enabled: true, consent: true, cookie: { domain: null } } });
  await event(runtime);
  assert.equal(store.writes.length, 1);
  assert.doesNotMatch(store.writes[0], /Domain=/);
  const fresh = tag({ identity: { storage: 'cookie', enabled: true } });
  store.writes.length = 0;
  fresh.setIdentityConsent(false);
  assert.ok(store.writes.every((value) => value.includes('Max-Age=0;')));
  assert.equal(store.jar.size, 0);
});

for (const kind of ['cookie', 'localStorage']) {
  test(`${kind}: session-only identity respects consent and never creates a device ID`, async (t) => {
    const store = kind === 'cookie' ? cookies(t) : storage(t);
    const options = { identity: { storage: kind, enabled: true, device: { enabled: false }, session: { enabled: true } } };
    const runtime = tag(options);
    const unconsented = await event(runtime);
    assert.equal(unconsented.device.id, undefined);
    assert.equal(unconsented.session, undefined);
    if (kind === 'cookie') { assert.equal(store.reads(), 0); assert.equal(store.writes.length, 0); }
    else assert.deepEqual(store.counts(), [0, 0]);
    runtime.setIdentityConsent(true);
    const first = await event(runtime);
    assert.equal(first.device.id, undefined);
    assert.match(first.session.id, uuid);
    const reloaded = tag(options);
    reloaded.setIdentityConsent(true);
    assert.equal((await event(reloaded)).session.id, first.session.id);
    const supplied = await event(reloaded, { ...payload(), device: { id: 'provided-device' } });
    assert.equal(supplied.device.id, 'provided-device');
    assert.notEqual(supplied.session.id, first.session.id);
    runtime.setIdentityConsent(false);
    assert.equal((await event(runtime)).session, undefined);
    assert.equal((kind === 'cookie' ? store.jar : store.data).size, 0);
  });
  test(`${kind}: device and session storage both stay untouched before consent`, async (t) => {
    const store = kind === 'cookie' ? cookies(t) : storage(t);
    const runtime = tag({ identity: { storage: kind, enabled: true, session: { enabled: true } } });
    const result = await event(runtime);
    assert.equal(result.device.id, undefined);
    assert.equal(result.session, undefined);
    if (kind === 'cookie') { assert.equal(store.reads(), 0); assert.equal(store.writes.length, 0); }
    else assert.deepEqual(store.counts(), [0, 0]);
  });
}
