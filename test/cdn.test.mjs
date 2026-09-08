import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

test('published browser artifact matches a fresh build and sends native browser events', async () => {
  const artifact = await readFile(new URL('../cdn/browser.iife.js', import.meta.url), 'utf8');
  const build = await readFile(new URL('../dist/browser.iife.js', import.meta.url), 'utf8');
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
});
