import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createJsonTag as createBrowserJsonTag } from '../dist/browser/index.js';
import { createJsonTag as createNodeJsonTag } from '../dist/node/index.js';

test('browser adapter creates event ID, time, origin, and context', async () => {
  let payload;
  const jsonTag = createBrowserJsonTag({
    id_factory: () => 'browser-event-1',
    now: () => new Date('2026-07-22T12:34:56.000Z'),
    transport(value) {
      payload = value;
    },
  });

  await jsonTag.send({ event: { name: 'marketplace_view', origin: 'backend' } });

  assert.equal(payload.event.id, 'browser-event-1');
  assert.equal(payload.event.occurred_at, '2026-07-22T12:34:56.000Z');
  assert.equal(payload.event.origin, 'frontend');
  assert.equal(typeof payload.context.timezone, 'string');
});

test('browser fetch keepalive transport sends JSON and accepts an empty response', async () => {
  let request;
  const jsonTag = createBrowserJsonTag({
    endpoint: '/api/client-events',
    fetch: async (url, options) => {
      request = { url, options };
      return new Response(null, { status: 202 });
    },
    id_factory: () => 'browser-event-2',
    now: () => new Date('2026-07-22T12:34:56.000Z'),
    transport: 'fetchKeepalive',
  });

  const result = await jsonTag.send({ event: { name: 'listing_view' } });

  assert.equal(result.transport.accepted, true);
  assert.equal(request.url, '/api/client-events');
  assert.equal(request.options.keepalive, true);
  assert.equal(request.options.credentials, 'include');
  assert.equal(
    JSON.parse(request.options.body).event.id,
    'browser-event-2',
  );
});

test('node adapter passes events to an application transport without browser APIs', async () => {
  let payload;
  const jsonTag = createNodeJsonTag({
    transport(value) {
      payload = value;
    },
  });

  await jsonTag.send({
    event: {
      id: 'backend-event-1',
      name: 'trade_completed',
      occurred_at: '2026-07-22T12:34:56.000Z',
    },
    trade: { id: 'trade-1' },
  });

  assert.equal(payload.event.origin, 'backend');
  assert.equal(payload.trade.id, 'trade-1');
});

test('browser context excludes query parameters and hashes from URLs', async () => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let payload;

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      href: 'https://example.test/marketplace?token=secret#details',
      pathname: '/marketplace',
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      referrer: 'https://referrer.test/campaign?user=secret#fragment',
      title: 'Marketplace',
    },
  });

  try {
    const jsonTag = createBrowserJsonTag({
      id_factory: () => 'browser-event-private-url',
      now: () => new Date('2026-07-22T12:34:56.000Z'),
      transport(value) {
        payload = value;
      },
    });

    await jsonTag.send({ event: { name: 'page_view' } });

    assert.equal(payload.page.url, 'https://example.test/marketplace');
    assert.equal(payload.page.path, '/marketplace');
    assert.equal(payload.page.referrer, 'https://referrer.test/campaign');
    assert.equal(JSON.stringify(payload).includes('secret'), false);
  } finally {
    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation);
    } else {
      delete globalThis.location;
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
      delete globalThis.document;
    }
  }
});
