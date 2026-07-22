import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installJsonTagCompatibility } from '../dist/browser/compatibility.js';

function createTarget(fetchImplementation) {
  const beacons = [];
  return {
    Blob,
    CompressionStream: globalThis.CompressionStream,
    Headers,
    Request,
    Response,
    TextEncoder,
    btoa,
    console: { log() {} },
    document: {
      characterSet: 'UTF-8',
      referrer: 'https://example.test/previous',
      title: 'Marketplace',
    },
    fetch: fetchImplementation,
    innerHeight: 900,
    innerWidth: 1440,
    location: {
      href: 'https://example.test/marketplace',
      hostname: 'example.test',
      pathname: '/marketplace',
    },
    navigator: {
      language: 'de-DE',
      sendBeacon(url, body) {
        beacons.push({ body, url });
        return true;
      },
      userAgent: 'Test Browser',
    },
    screen: { height: 1080, width: 1920 },
    sentBeacons: beacons,
  };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('compatibility wrapper keeps the global API and original wire payload', async () => {
  const requests = [];
  const target = createTarget(async (url, options) => {
    requests.push({ url, options });
    return Response.json({ request_id: 'response-1' }, { status: 200 });
  });
  const send = installJsonTagCompatibility(target);

  const accepted = send(
    'https://example.test/events',
    {
      empty: '',
      event_name: 'listing_view',
      event_type: 'custom',
      false_value: false,
      zero: 0,
    },
    false,
    { dataLayerEventName: 'json_tag_response', dataLayerName: 'dataLayer' },
    'fetch',
    true,
    true,
    undefined,
    false,
    { enabled: false },
  );
  await nextTurn();

  assert.equal(accepted, true);
  assert.equal(target.jsonTagSendData, send);
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    event_name: 'listing_view',
    event_type: 'custom',
    false_value: false,
    language: 'de-DE',
    page_encoding: 'UTF-8',
    page_hostname: 'example.test',
    page_location: 'https://example.test/marketplace',
    page_path: '/marketplace',
    page_referrer: 'https://example.test/previous',
    page_title: 'Marketplace',
    screen_resolution: '1920x1080',
    viewport_size: '1440x900',
    zero: 0,
  });
  assert.deepEqual(target.dataLayer, [{
    _clear: true,
    event: 'json_tag_response',
    jsonclient: { request_id: 'response-1' },
  }]);
});

test('compatibility wrapper batches payloads without exposing runtime envelopes', async () => {
  let request;
  const requested = new Promise((resolve) => {
    request = { resolve };
  });
  const target = createTarget(async (url, options) => {
    request.url = url;
    request.options = options;
    request.resolve();
    return Response.json({}, { status: 200 });
  });
  const send = installJsonTagCompatibility(target);
  const batch = { delay: 60_000, enabled: true, maxRetries: 0, maxSize: 2 };

  assert.equal(send('https://example.test/events', { event_name: 'one' }, false, false, 'fetch', false, false, undefined, false, batch), true);
  assert.equal(send('https://example.test/events', { event_name: 'two' }, false, false, 'fetch', false, false, undefined, false, batch), true);
  await requested;

  assert.deepEqual(JSON.parse(request.options.body), [
    { event_name: 'one' },
    { event_name: 'two' },
  ]);
});

test('compatibility wrapper preserves base64 fallback and keepalive headers', async () => {
  let request;
  const target = createTarget(async (url, options) => {
    request = { url, options };
    return Response.json({}, { status: 200 });
  });
  const send = installJsonTagCompatibility(target);

  send(
    'https://example.test/events',
    { event_name: 'unicode', label: 'Grüße' },
    true,
    false,
    'fetchKeepalive',
    false,
    false,
    undefined,
    true,
    { enabled: false },
  );
  await nextTurn();

  assert.equal(request.url, 'https://example.test/events/ba');
  assert.equal(request.options.keepalive, true);
  assert.equal(request.options.headers.get('X-Keepalive-Request'), '1');
  assert.deepEqual(
    JSON.parse(Buffer.from(request.options.body, 'base64').toString('utf8')),
    { event_name: 'unicode', label: 'Grüße' },
  );
});

test('compatibility sendBeacon keeps the base64 endpoint convention', async () => {
  const target = createTarget(async () => {
    throw new Error('fetch must not be called');
  });
  const send = installJsonTagCompatibility(target);

  send(
    'https://example.test/events',
    { event_name: 'beacon', label: 'Grüße' },
    true,
    false,
    'sendBeacon',
    false,
    false,
    undefined,
    true,
    { enabled: false },
  );
  await nextTurn();

  assert.equal(target.sentBeacons.length, 1);
  assert.equal(target.sentBeacons[0].url, 'https://example.test/events/ba');
  assert.deepEqual(
    JSON.parse(Buffer.from(target.sentBeacons[0].body, 'base64').toString('utf8')),
    { event_name: 'beacon', label: 'Grüße' },
  );
});

test('compatibility wrapper returns false synchronously for invalid endpoints', () => {
  let calls = 0;
  const target = createTarget(async () => {
    calls += 1;
    return Response.json({}, { status: 200 });
  });
  const send = installJsonTagCompatibility(target);

  assert.equal(send('undefined', { event_name: 'invalid' }), false);
  assert.equal(calls, 0);
});
