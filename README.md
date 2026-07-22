# JSON Tag Runtime

Transport-neutral runtime for producing JSON tracking events in browsers and
Node.js. The runtime is the shared implementation behind standalone JSON Tag
integrations and, later, the client-side Google Tag Manager template.

The package name and public API are an initial `0.1.0` design and may still
change before the first publication.

## Scope

The runtime owns:

- preparation and cleanup of the minimal producer-event envelope,
- batching and transport-level retry basics,
- an explicit `flush()` operation,
- browser HTTP transports using `fetch`, `sendBeacon`, and fetch keepalive,
- a transport interface for application-specific Node.js integrations.

It intentionally does not own application event schemas, identity enrichment,
consent decisions, device or bot detection, Redis/BullMQ queues, analytics
processing, or destination routing.

## Browser

```js
import { createJsonTag } from 'json-tag-runtime/browser';

const jsonTag = createJsonTag({
  endpoint: '/api/client-events',
  transport: 'fetch',
  batch: {
    enabled: true,
    delay: 150,
    max_size: 20,
  },
});

await jsonTag.send({
  schema_version: '1.0.0',
  event: {
    name: 'listing_view',
  },
  listing: {
    id: 'public-listing-reference',
  },
});

await jsonTag.flush();
```

The browser adapter creates a missing `event.id`, `event.occurred_at`, and the
`frontend` origin. It adds page, referrer, locale, timezone, viewport, and
screen context when available. Automatically collected page and referrer URLs
exclude query parameters and URL fragments. Values such as identity,
environment, User-Agent, Client Hints, and trusted request metadata must be set
or confirmed by the receiving first-party server.

The classic-script build exposes the same browser exports as
`globalThis.JsonTagRuntime`:

```html
<script src="/browser.iife.js"></script>
<script>
  const jsonTag = JsonTagRuntime.createJsonTag({
    endpoint: '/api/client-events',
  });
</script>
```

### Existing JSON Tag GTM installations

The compatibility builds `dist/jsonTagSendData.js` and
`dist/jsonTagSendData-min.js` keep the existing global
`jsonTagSendData(...)` function, positional arguments, payload shape, browser
context fields, compression/base64 behavior, and Data Layer response callback.
Internally they use the new runtime Core for batching and retry handling.

The generated files are vendored into the existing `json-tag` GTM template
repository without changing the template API:

```bash
npm run build
npm run sync:json-tag -- /path/to/json-tag
```

Do not edit the generated compatibility files in the GTM repository directly.

## Node.js

```js
import { createJsonTag } from 'json-tag-runtime/node';

const jsonTag = createJsonTag({
  transport: async (eventOrBatch) => {
    await trackingQueue.add(eventOrBatch);
    return { accepted: true };
  },
});

await jsonTag.send({
  schema_version: '1.0.0',
  event: {
    id: businessEventId,
    name: 'trade_completed',
    occurred_at: businessEventTime.toISOString(),
  },
  trade: {
    id: publicTradeReference,
  },
});
```

The Node.js adapter deliberately requires the business event ID and occurrence
time. It does not call a browser endpoint or include a queue implementation.
The application-provided transport is the integration boundary to a tracking
service, queue, HTTP client, or another destination.

## Batching and retries

Batching is disabled by default. When enabled, events are flushed after
`batch.delay`, when `batch.max_size` is reached, or when `flush()` is called.
One event is sent as a JSON object and multiple events as a JSON array.

Retries are limited to transient failures: network errors, `408`, `429`, and
`5xx` responses. Defaults are three attempts with exponential backoff starting
at 250 ms and capped at five seconds. Permanent client errors are not retried.
The runtime is an in-memory producer helper, not a durable delivery queue.

## Development

```bash
npm install
npm test
npm run check
```

Build outputs:

- `dist/core/index.js`
- `dist/browser/index.js`
- `dist/node/index.js`
- `dist/browser.iife.js`
- TypeScript declarations under the matching `dist` paths
