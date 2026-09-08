# JSON Tag Runtime

Transport-neutral runtime for producing JSON tracking events in browsers and
Node.js. The runtime is the shared implementation behind standalone JSON Tag
integrations and, later, the client-side Google Tag Manager template.

The browser identity API is being prepared for `v0.2.0`; use published release tags for CDN integrations.

## Scope

The runtime owns:

- preparation and cleanup of the minimal producer-event envelope,
- batching and transport-level retry basics,
- an explicit `flush()` operation,
- browser HTTP transports using `fetch`, `sendBeacon`, and fetch keepalive,
- a transport interface for application-specific Node.js integrations.

It intentionally does not own application event schemas, server-side identity enrichment,
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
<script src="/browser.iife.min.js"></script>
<script>
  const jsonTag = JsonTagRuntime.createJsonTag({
    endpoint: '/api/client-events',
  });
</script>
```

### Classic browser script: self-hosted, inline or jsDelivr

The generated `cdn/browser.iife.min.js` is the minified standalone browser runtime.
The readable `cdn/browser.iife.js` remains available for debugging.
`cdn/browser.iife.es5.min.js` provides ES5 syntax for inline Web GTM. All three files
are generated from the same source and verified against fresh builds. The runtime uses
`JsonTagRuntime.createJsonTag(...)` without an import statement and contains no
legacy GTM adapter. Host this file on your website, load it through jsDelivr,
or include its contents before initialization in a JavaScript action.
Adobe Launch / Tags uses Core → Custom Code → JavaScript without `<script>`
tags. A Web GTM Custom HTML tag uses script tags; for inline Web GTM code,
use the ready-made `browser.iife.es5.min.js` build. No manual transpilation is needed.
Loading the external script uses the regular browser build. The ES5 variant adapts
syntax for the tag editor; it still requires modern browser APIs such as Promise,
fetch, Set and crypto.randomUUID. It does not add the legacy GTM adapter.

After the artifact commit and its release tag have been pushed to this public repository, its URL is:

```text
https://cdn.jsdelivr.net/gh/floriangoetting/json-tag-runtime@v0.2.0/cdn/browser.iife.min.js
```

Use the exact published release tag. The example `v0.2.0` becomes available only
after that tag is published. GitHub files are served by jsDelivr without an npm
publication or CDN account. Never move a published release tag; create a new
version for updates. DDA asks for Library Version and builds this URL automatically.
See [jsDelivr's GitHub documentation](https://github.com/jsdelivr/jsdelivr#github).

Use Node.js 24 for the build toolchain, matching CI. To prepare an updated artifact:

```bash
npm ci
npm run build:cdn
npm run check
npm run check:release -- v0.2.0
git diff --check
```

Review and commit the source changes and all generated files under `cdn/`
together. For a new version, update `package.json` and the lockfile before building.
After approval to publish, create an annotated tag matching the package version
(`v0.2.0` for this update), then push the commit and that tag. Retrieve the release URL
and compare the response with the committed file before updating consumer defaults.
A GitHub Release can reference the same tag; a release attachment alone is not
served through the `/gh/` file URL. The CI
check rebuilds the runtime and rejects an artifact that differs from that build.
Do not edit either generated file under `cdn/` manually. `dist/` remains ignored; these
explicit browser artifacts are versioned for GitHub CDN distribution.

### Optional browser identity (v0.2.0)

Browser identity is opt-in and disabled for existing integrations. Core, Node.js
and legacy GTM adapters do not change. Enable it for standalone browser tracking:

```js
const jsonTag = JsonTagRuntime.createJsonTag({
  endpoint: '/api/client-events',
  identity: {
    enabled: true,
    consent: false,
    storage_key: 'my_project_identity',
    storage: 'cookie',
    cookie: { domain: 'auto' }, // Default: share across this site's subdomains.
    session: { enabled: false, inactivity_minutes: 30 },
  },
});
```

Connect your consent manager's actual decisions to `jsonTag.setIdentityConsent(true)`
when identity storage is allowed and `jsonTag.setIdentityConsent(false)` on withdrawal.
Initialization and sending before identity consent do not read or write identity
storage. The first consented send creates a random UUID at `device.id`, stored in
a cookie by default (one year, renewed on activity). It identifies a browser profile,
not a physical device. Cookies use Path=/, SameSite=Lax and Secure on HTTPS.
The default `cookie.domain: 'auto'` finds the broadest cookie domain accepted by
this browser: `analytics.example.com` uses `example.com`, and `shop.example.co.uk`
uses `example.co.uk`. This uses a short-lived probe cookie on the first consented
send and removes it immediately. The browser's public suffix rules also protect
shared hosting domains such as `github.io`. No probe runs before storage consent.
Localhost and IP addresses use host-only cookies. Use the same storage key on
cooperating subdomains to share IDs; unrelated domains retain separate IDs, so one
configuration can run on multiple websites without hardcoding their domains.
Set `cookie.domain: null` for host-only storage or a matching parent hostname such
as `'example.com'` for an explicit override. Withdrawal deletes the owned cookie
without creating probe cookies, including when this instance has not sent yet.
Use a distinct cookie name from JSON Client; it does not read or modify JSON
Client cookies. `storage: 'localStorage'` remains available for strictly
origin-scoped storage, which cannot be shared across subdomains. Browser policy
can shorten either storage lifetime. Changing storage or domain does not migrate
old state; reset it with the old configuration first if needed. Use separate storage keys for unrelated projects/environments.
The DDA setup derives the key from its project and environment IDs.

The same storage choice, cookie domain and consent switch govern device and session
IDs. Before consent, neither ID is generated by the runtime and identity storage
is untouched, even with sessions enabled. Withdrawal removes their shared stored
state. Supplied IDs remain the caller's responsibility and are preserved.

Set `identity.device.enabled: false` to disable automatic device IDs independently
of `identity.session.enabled`. This allows session IDs with an externally supplied
device ID, or session-only tracking after consent. Without a supplied device ID,
the session is stored without creating a hidden device ID; changing the supplied
device ID starts a new session.

Sessions are **off by default**: DDA computes them from inactivity during analysis.
With `session.enabled: true`, the runtime adds a UUID at `session.id`, shared across
pages and tabs until the inactivity limit (1–1440 minutes, default 30). Activity time
is separate; IDs are not timestamps. Sessions also rotate on device changes or clock
rollback. Select supplied sessions in DDA to use these IDs for analysis.

Supplied `device.id` and `session.id` always take precedence, including numeric
JSON Client session IDs. Leave browser identity disabled when JSON Client manages
IDs. `id_factory` still applies only to `event.id`; identity uses crypto.randomUUID.

Blocked storage falls back to memory for this runtime instance: IDs then do not
survive reloads. Web Locks serialize creation/renewal between cooperating tabs on the same origin.
Different subdomains and browsers without Web Locks can race on simultaneous first
creation or renewal; cookies do not provide cross-origin locking.

`resetIdentity()` removes stored device/session state; the next consented event
creates new IDs. `setIdentityConsent(false)` also disables automatic enrichment
until re-granted. Connect consent changes in every tab. These APIs control identity,
not event permission: supplied IDs remain untouched and queued/in-flight events
are not recalled. Gate event sending and batching through your consent flow.

### DDA daily identity without browser storage

For direct browser-to-DDA requests, opt in with `headers: { ...yourHeaders,
'X-DDA-Identity-Mode': 'daily' }` and use the fetch transport. DDA must have daily
identity enabled. No Runtime version upgrade is needed just to set this header.
DDA derives a missing Device ID from the actual request and rotates it each UTC day.
The runtime never receives the secret, fingerprints the browser, or determines the
client IP. It can combine this header with optional consented cookie identity:
DDA preserves a supplied `device.id` and derives the daily fallback only when absent.
Choose whether events are permitted independently through your consent integration.

A first-party backend may forward minimized visitor context using a **server**
ingestion key and `X-DDA-Source-Context`; browsers must never set this header.
The backend must derive that context from its trusted HTTP request, not from event
JSON. See DDA's ingestion contract for the validated header format. Skin2Go keeps
all browser requests on its own backend and lets DDA own this derivation.

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
- `dist/browser.iife.js` (readable)
- `dist/browser.iife.min.js` (minified)
- `dist/browser.iife.es5.min.js` (minified, ES5 syntax for inline Web GTM)
- TypeScript declarations under the matching `dist` paths

### Browser cookie verification

`npm run check` covers the identity lifecycle and builds the CDN source separately
with `npm run build:cdn`. For the optional real-browser domain tests, run
`RUN_IDENTITY_BROWSER_TEST=1 node --test test/identity.browser.test.mjs` in a
Docker browser runner with Playwright and Chromium available. `PLAYWRIGHT_MODULE`
can point to its installed Playwright module and `CHROMIUM_EXECUTABLE` to Chromium.
The test covers consent, public suffixes, subdomain sharing, host-only overrides,
localhost, IP addresses, and withdrawal before the first send. It sends no events
to an external ingestion service.

### DDA download and inline artifacts

Run `npm run export:dda -- /path/to/dda-app` to build and copy the minified browser
and Web GTM files into DDA's `src/static/vendor/json-tag-runtime/VERSION/`, along
with the license. The generated `src/platform/runtimeLibrary.json` records version,
URLs and SHA-256 checksums. DDA offers the regular file as a download for self-hosting
and loads the appropriate file as verified text for inline snippets. It never executes
that file in the setup interface. Consumer copies are generated artifacts; update
source here and export again instead of editing them in DDA.

The ES5 syntax build uses Babel and esbuild and is parsed with Acorn in ES5 mode.
`npm run check` also verifies its reproducibility and event/identity behavior.
The included DDA files do not require a public release; jsDelivr still requires a
published release tag. This does not publish v0.2.0.
