import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

test('package subpath exports resolve', async () => {
  const [core, browser, node] = await Promise.all([
    import('json-tag-runtime/core'),
    import('json-tag-runtime/browser'),
    import('json-tag-runtime/node'),
  ]);

  assert.equal(typeof core.createJsonTagCore, 'function');
  assert.equal(typeof browser.createJsonTag, 'function');
  assert.equal(typeof node.createJsonTag, 'function');
});

test('IIFE build exposes the browser API as JsonTagRuntime', async () => {
  const source = await readFile(
    new URL('../dist/browser.iife.js', import.meta.url),
    'utf8',
  );
  const context = {};

  vm.runInNewContext(source, context);

  assert.equal(typeof context.JsonTagRuntime.createJsonTag, 'function');
  assert.equal(
    typeof context.JsonTagRuntime.createBrowserHttpTransport,
    'function',
  );
});

for (const filename of ['jsonTagSendData.js', 'jsonTagSendData-min.js']) {
  test(`${filename} installs jsonTagSendData on window`, async () => {
    const source = await readFile(
      new URL(`../dist/${filename}`, import.meta.url),
      'utf8',
    );
    const context = { window: {} };

    vm.runInNewContext(source, context);

    assert.equal(typeof context.window.jsonTagSendData, 'function');
  });
}
