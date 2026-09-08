import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

for (const filename of ['browser.iife.js', 'browser.iife.min.js', 'browser.iife.es5.min.js']) {
  test(`${filename} matches a fresh build and sends native browser events`, async () => {
    const artifact = await readFile(new URL(`../cdn/${filename}`, import.meta.url), 'utf8');
    const build = await readFile(new URL(`../dist/${filename}`, import.meta.url), 'utf8');
    assert.equal(artifact.slice(artifact.indexOf('\n') + 1), build, 'Run npm run build:cdn and commit its generated output.');
    const context = {};
    vm.runInNewContext(artifact, context);
    let delivered;
    const tracking = context.JsonTagRuntime.createJsonTag({
      browser_context: false,
      id_factory: () => 'cdn-smoke-event',
      transport: async (payload) => { delivered = payload; return { accepted: true }; },
    });
    await tracking.send({ event: { name: 'cdn_smoke' }, device: { id: 'test-device' } });
    assert.equal(delivered.event.name, 'cdn_smoke');
    assert.equal(delivered.event.id, 'cdn-smoke-event');
    assert.equal(delivered.event.origin, 'frontend');
    assert.equal(delivered.device.id, 'test-device');
    context.crypto = globalThis.crypto;
    const identityTracking = context.JsonTagRuntime.createJsonTag({
      browser_context: false,
      id_factory: () => 'identity-smoke-event',
      identity: { enabled: true, session: { enabled: true } },
      transport: async (payload) => { delivered = payload; return { accepted: true }; },
    });
    identityTracking.setIdentityConsent(true);
    await identityTracking.send({ event: { name: 'identity_smoke' } });
    assert.match(delivered.device.id, /^[0-9a-f-]{36}$/);
    assert.match(delivered.session.id, /^[0-9a-f-]{36}$/);
    identityTracking.setIdentityConsent(false);
    await identityTracking.send({ event: { name: 'identity_smoke' } });
    assert.equal(delivered.device, undefined);
    assert.equal(delivered.session, undefined);
  });

}

test('release tags match the package version and generate the versioned CDN URL', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const script = fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script, `v${version}`], { encoding: 'utf8' });
  assert.ok(output.includes(`json-tag-runtime@v${version}/cdn/browser.iife.min.js`));
  for (const tag of ['main', 'latest', 'v999.999.999']) {
    assert.throws(() => execFileSync(process.execPath, [script, tag], { stdio: 'pipe' }));
  }
});
