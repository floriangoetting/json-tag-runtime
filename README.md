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

### Classic browser script: self-hosted, inline or jsDelivr

The generated `cdn/browser.iife.js` is the standalone browser runtime. It uses
`JsonTagRuntime.createJsonTag(...)` without an import statement and contains no
legacy GTM adapter. Host this file on your website, load it through jsDelivr,
or include its contents before initialization in a JavaScript action.
Adobe Launch / Tags uses Core → Custom Code → JavaScript without `<script>`
tags. A Web GTM Custom HTML tag uses script tags; for inline Web GTM code,
transpile the ES2020 bundle to ES5 first. Loading the external script does not
require inline transpilation.

After the artifact commit and its release tag have been pushed to this public repository, its URL is:

```text
https://cdn.jsdelivr.net/gh/floriangoetting/json-tag-runtime@v0.1.0/cdn/browser.iife.js
```

Use the exact published release tag. The example `v0.1.0` becomes available only
after that tag is published. GitHub files are served by jsDelivr without an npm
publication or CDN account. Never move a published release tag; create a new
version for updates. DDA asks for Library Version and builds this URL automatically.
See [jsDelivr's GitHub documentation](https://github.com/jsdelivr/jsdelivr#github).

To prepare an updated artifact:

```bash
npm ci
npm run build:cdn
npm run check
npm run check:release -- v0.1.0
git diff --check
```

Review and commit the source changes and generated `cdn/browser.iife.js`
together. For a new version, update `package.json` and the lockfile before building.
After approval to publish, create an annotated tag matching the package version
(`v0.1.0` initially), then push the commit and that tag. Retrieve the release URL
and compare the response with the committed file before updating consumer defaults.
A GitHub Release can reference the same tag; a release attachment alone is not
served through the `/gh/` file URL. The CI
check rebuilds the runtime and rejects an artifact that differs from that build.
Do not edit `cdn/browser.iife.js` manually. `dist/` remains ignored; only this
explicit browser artifact is versioned for GitHub CDN distribution.

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

Until the package is published, the Browser and Node.js ESM builds can be
exported reproducibly to arbitrary consumer paths:

```bash
npm run export:esm -- /path/to/browser.js /path/to/node.js
```

The target files are generated artifacts and must not be maintained as
independent runtime implementations in consuming repositories.

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
