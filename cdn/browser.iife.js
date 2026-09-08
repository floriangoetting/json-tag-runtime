/* Generated from src/browser/index.ts by npm run build:cdn. Do not edit. SPDX-License-Identifier: Apache-2.0 */
"use strict";
var JsonTagRuntime = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/browser/index.ts
  var index_exports = {};
  __export(index_exports, {
    createBrowserHttpTransport: () => createBrowserHttpTransport,
    createJsonTag: () => createJsonTag
  });

  // src/core/errors.ts
  var JsonTagConfigurationError = class extends Error {
    constructor() {
      super(...arguments);
      __publicField(this, "name", "JsonTagConfigurationError");
    }
  };
  var JsonTagPayloadError = class extends Error {
    constructor() {
      super(...arguments);
      __publicField(this, "name", "JsonTagPayloadError");
    }
  };

  // src/core/config.ts
  function finiteNumber(value, fallback, minimum) {
    if (value === void 0) {
      return fallback;
    }
    if (!Number.isFinite(value) || value < minimum) {
      throw new JsonTagConfigurationError(`Expected a finite number greater than or equal to ${minimum}`);
    }
    return value;
  }
  function positiveInteger(value, fallback) {
    const normalized = finiteNumber(value, fallback, 1);
    if (!Number.isInteger(normalized)) {
      throw new JsonTagConfigurationError("Expected a positive integer");
    }
    return normalized;
  }
  function normalizeBatch(options) {
    return {
      delay: finiteNumber(options?.delay, 150, 0),
      enabled: options?.enabled ?? false,
      max_size: positiveInteger(options?.max_size, 20)
    };
  }
  function normalizeRetry(options) {
    return {
      backoff_factor: finiteNumber(options?.backoff_factor, 2, 1),
      delay: finiteNumber(options?.delay, 250, 0),
      max_attempts: positiveInteger(options?.max_attempts, 3),
      max_delay: finiteNumber(options?.max_delay, 5e3, 0)
    };
  }
  function normalizeTransport(transport) {
    if (typeof transport === "function") {
      return { send: transport };
    }
    if (!transport || typeof transport.send !== "function") {
      throw new JsonTagConfigurationError("A transport function or object with send() is required");
    }
    return transport;
  }
  function normalizeCoreOptions(options) {
    if (!options || typeof options !== "object") {
      throw new JsonTagConfigurationError("A configuration object is required");
    }
    if (typeof options.origin !== "string" || options.origin.trim() === "") {
      throw new JsonTagConfigurationError("origin must be a non-empty string");
    }
    return {
      ...options,
      batch: normalizeBatch(options.batch),
      clean_payload: options.clean_payload ?? true,
      origin: options.origin.trim(),
      retry: normalizeRetry(options.retry),
      transport: normalizeTransport(options.transport)
    };
  }

  // src/core/clean.ts
  var OMIT = /* @__PURE__ */ Symbol("omit");
  function isEmpty(value) {
    return value === null || value === "" || Array.isArray(value) && value.length === 0 || typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
  }
  function normalizeValue(value, clean, ancestors, path) {
    if (value === void 0 || typeof value === "function" || typeof value === "symbol") {
      return clean ? OMIT : (() => {
        throw new JsonTagPayloadError(`Unsupported value at ${path}`);
      })();
    }
    if (value === null || typeof value === "boolean" || typeof value === "string") {
      return clean && isEmpty(value) ? OMIT : value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return clean ? OMIT : (() => {
          throw new JsonTagPayloadError(`Non-finite number at ${path}`);
        })();
      }
      return value;
    }
    if (typeof value === "bigint") {
      throw new JsonTagPayloadError(`BigInt is not JSON-serializable at ${path}`);
    }
    if (typeof value !== "object") {
      throw new JsonTagPayloadError(`Unsupported value at ${path}`);
    }
    if (ancestors.has(value)) {
      throw new JsonTagPayloadError(`Circular reference at ${path}`);
    }
    ancestors.add(value);
    if (value instanceof Date) {
      ancestors.delete(value);
      const iso = value.toJSON();
      return clean && isEmpty(iso) ? OMIT : iso;
    }
    if (Array.isArray(value)) {
      const result2 = value.map((item, index) => normalizeValue(item, clean, ancestors, `${path}[${index}]`)).filter((item) => item !== OMIT);
      ancestors.delete(value);
      return clean && isEmpty(result2) ? OMIT : result2;
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new JsonTagPayloadError(`Unsafe key at ${path}.${key}`);
      }
      const normalized = normalizeValue(item, clean, ancestors, `${path}.${key}`);
      if (normalized !== OMIT) {
        result[key] = normalized;
      }
    }
    ancestors.delete(value);
    return clean && isEmpty(result) ? OMIT : result;
  }
  function normalizeJsonObject(value, clean) {
    const normalized = normalizeValue(value, clean, /* @__PURE__ */ new Set(), "$");
    if (normalized === OMIT || normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
      throw new JsonTagPayloadError("Event payload must be a JSON object");
    }
    return normalized;
  }

  // src/core/event.ts
  function requiredString(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new JsonTagPayloadError(`${field} must be a non-empty string`);
    }
    return value.trim();
  }
  function resolveId(input, options) {
    if (input.event.id !== void 0) {
      return requiredString(input.event.id, "event.id");
    }
    if (!options.id_factory) {
      throw new JsonTagPayloadError("event.id is required by this adapter");
    }
    return requiredString(options.id_factory(), "generated event.id");
  }
  function resolveOccurredAt(input, options) {
    const occurredAt = input.event.occurred_at ?? options.now?.().toISOString();
    const normalized = requiredString(occurredAt, "event.occurred_at");
    if (Number.isNaN(Date.parse(normalized))) {
      throw new JsonTagPayloadError("event.occurred_at must be an ISO-compatible date string");
    }
    return normalized;
  }
  function prepareEvent(input, options) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new JsonTagPayloadError("Event payload must be an object");
    }
    if (!input.event || typeof input.event !== "object" || Array.isArray(input.event)) {
      throw new JsonTagPayloadError("event must be an object");
    }
    const event = {
      ...input.event,
      id: resolveId(input, options),
      name: requiredString(input.event.name, "event.name"),
      occurred_at: resolveOccurredAt(input, options),
      origin: options.origin
    };
    const normalized = normalizeJsonObject(
      { ...input, event },
      options.clean_payload
    );
    return normalized;
  }

  // src/core/runtime.ts
  function wait(delay) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
  function normalizeTransportResult(result) {
    if (result === void 0) {
      return { accepted: true };
    }
    if (typeof result === "boolean") {
      return { accepted: result, retryable: !result };
    }
    return result;
  }
  function isRetryable(result) {
    if (result.retryable !== void 0) {
      return result.retryable;
    }
    if (result.status === void 0) {
      return !result.accepted;
    }
    return result.status === 408 || result.status === 429 || result.status >= 500;
  }
  function createJsonTagCore(options) {
    const config = normalizeCoreOptions(options);
    const queue = [];
    let timer;
    let activeFlush;
    const notifyError = (error, events, attempt, result) => {
      if (!config.on_error) {
        return;
      }
      const context = result === void 0 ? { attempt, events } : { attempt, events, result };
      config.on_error(error, context);
    };
    const dispatch = async (events) => {
      const payload = events.length === 1 ? events[0] : events;
      let lastResult = { accepted: false, retryable: true };
      for (let attempt = 1; attempt <= config.retry.max_attempts; attempt += 1) {
        try {
          lastResult = normalizeTransportResult(
            await config.transport.send(payload, { attempt })
          );
        } catch (error) {
          lastResult = { accepted: false, retryable: true };
          notifyError(error, events, attempt);
        }
        if (lastResult.accepted) {
          return lastResult;
        }
        if (!isRetryable(lastResult) || attempt === config.retry.max_attempts) {
          notifyError(
            new Error("JSON Tag transport rejected the payload"),
            events,
            attempt,
            lastResult
          );
          return lastResult;
        }
        const retryDelay = Math.min(
          config.retry.delay * config.retry.backoff_factor ** (attempt - 1),
          config.retry.max_delay
        );
        await wait(retryDelay);
      }
      return lastResult;
    };
    const flushQueued = async () => {
      if (timer !== void 0) {
        clearTimeout(timer);
        timer = void 0;
      }
      const result = { batches: 0, failed: 0, retained: 0, sent: 0 };
      while (queue.length > 0) {
        const events = queue.splice(0, config.batch.max_size);
        const transport = await dispatch(events);
        result.batches += 1;
        if (transport.accepted) {
          result.sent += events.length;
        } else {
          result.failed += events.length;
          if (config.retain_failed) {
            queue.unshift(...events);
            result.retained += events.length;
            break;
          }
        }
      }
      return result;
    };
    const flush = () => {
      if (!activeFlush) {
        activeFlush = flushQueued().finally(() => {
          activeFlush = void 0;
        });
      }
      return activeFlush;
    };
    const scheduleFlush = () => {
      if (timer !== void 0 || activeFlush) {
        return;
      }
      timer = setTimeout(() => {
        timer = void 0;
        void flush();
      }, config.batch.delay);
    };
    const send = async (input) => {
      const event = prepareEvent(input, config);
      if (!config.batch.enabled) {
        const transport = await dispatch([event]);
        return { event, state: "sent", transport };
      }
      queue.push(event);
      if (queue.length >= config.batch.max_size) {
        await flush();
      } else {
        scheduleFlush();
      }
      return { event, state: "queued" };
    };
    return {
      flush,
      pending: () => queue.length,
      send
    };
  }

  // src/browser/identity.ts
  var object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  var hasId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
  var uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  function createBrowserIdentity(options = {}, now) {
    const enabled = options.enabled === true;
    let consent = options.consent === true;
    const key = options.storage_key ?? "json_tag_identity_v1";
    const storage = options.storage ?? "cookie";
    const cookieName = encodeURIComponent(key);
    const domain = options.cookie?.domain?.replace(/^\./, "").toLowerCase();
    const maxAge = options.cookie?.max_age_seconds ?? 31536e3;
    if (!["cookie", "localStorage"].includes(storage)) throw new Error("Invalid identity.storage");
    if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 3456e4) throw new Error("identity.cookie.max_age_seconds must be between 1 and 34560000");
    if (domain && (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain) || !globalThis.location || location.hostname !== domain && !location.hostname.endsWith(`.${domain}`))) throw new Error("identity.cookie.domain must match this host or a parent domain");
    const cookieAttributes = `; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${globalThis.location?.protocol === "https:" ? "; Secure" : ""}`;
    const readStored = () => storage === "localStorage" ? globalThis.localStorage.getItem(key) : globalThis.document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const decodeStored = (raw) => storage === "cookie" ? decodeURIComponent(raw) : raw;
    const minutes = options.session?.inactivity_minutes ?? 30;
    if (!key.trim()) throw new Error("identity.storage_key must not be empty");
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new Error("identity.session.inactivity_minutes must be an integer from 1 to 1440");
    }
    let memory = {};
    let storageFailed = false;
    const read = () => {
      try {
        if (storageFailed) return memory;
        const raw = readStored();
        if (!raw) return {};
        const data = object(JSON.parse(decodeStored(raw)));
        const state = {};
        if (uuid(data.device_id)) state.device_id = data.device_id;
        const session = object(data.session);
        if (uuid(session.id) && hasId(session.device_id) && typeof session.last_activity === "number" && Number.isFinite(session.last_activity)) {
          state.session = { id: session.id, device_id: session.device_id, last_activity: session.last_activity };
        }
        return state;
      } catch {
        return memory;
      }
    };
    const write = (state) => {
      memory = state;
      try {
        if (storage === "localStorage") globalThis.localStorage.setItem(key, JSON.stringify(state));
        else {
          const value = encodeURIComponent(JSON.stringify(state));
          globalThis.document.cookie = `${cookieName}=${value}; Max-Age=${maxAge}${cookieAttributes}`;
          if (readStored() !== value) storageFailed = true;
        }
      } catch {
        storageFailed = true;
      }
    };
    const reset = () => {
      memory = {};
      if (!enabled) return;
      try {
        if (storage === "localStorage") globalThis.localStorage.removeItem(key);
        else globalThis.document.cookie = `${cookieName}=; Max-Age=0${cookieAttributes}`;
      } catch {
        storageFailed = true;
      }
    };
    return {
      reset,
      setConsent(granted) {
        consent = granted === true;
        if (!consent) reset();
      },
      enrich(input) {
        const enrich = () => {
          if (!enabled || !consent) return input;
          const device = object(input.device);
          const session = object(input.session);
          const needsDevice = !hasId(device.id);
          const needsSession = options.session?.enabled === true && !hasId(session.id);
          if (!needsDevice && !needsSession) return input;
          const state = read();
          const deviceId = hasId(device.id) ? device.id : state.device_id ?? globalThis.crypto.randomUUID();
          if (needsDevice) state.device_id = String(deviceId);
          let sessionId;
          if (needsSession) {
            const time = now().getTime();
            const previous = state.session;
            sessionId = previous && previous.device_id === deviceId && time >= previous.last_activity && time - previous.last_activity < minutes * 6e4 ? previous.id : globalThis.crypto.randomUUID();
            state.session = { id: sessionId, device_id: deviceId, last_activity: time };
          }
          write(state);
          return {
            ...input,
            ...needsDevice ? { device: { ...device, id: deviceId } } : {},
            ...needsSession ? { session: { ...session, id: sessionId } } : {}
          };
        };
        if (!enabled || !consent) return input;
        if (globalThis.navigator?.locks) {
          return globalThis.navigator.locks.request(key, enrich);
        }
        return enrich();
      }
    };
  }

  // src/browser/context.ts
  function mergeObject(defaults, value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaults;
    }
    return { ...defaults, ...value };
  }
  function stripQueryAndHash(value, base) {
    try {
      const url = new URL(value, base);
      return `${url.origin}${url.pathname}`;
    } catch {
      return void 0;
    }
  }
  function withBrowserContext(input) {
    const page = {};
    const context = {};
    if (typeof location !== "undefined") {
      page.path = location.pathname;
      const pageUrl = stripQueryAndHash(location.href);
      if (pageUrl) page.url = pageUrl;
    }
    if (typeof document !== "undefined") {
      const referrer = document.referrer ? stripQueryAndHash(
        document.referrer,
        typeof location === "undefined" ? void 0 : location.href
      ) : void 0;
      if (referrer) page.referrer = referrer;
      if (document.title) page.title = document.title;
    }
    if (typeof navigator !== "undefined" && navigator.language) {
      context.locale = navigator.language;
    }
    try {
      context.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
    }
    if (typeof window !== "undefined") {
      context.viewport = {
        height: window.innerHeight,
        width: window.innerWidth
      };
      if (window.screen) {
        context.screen = {
          height: window.screen.height,
          width: window.screen.width
        };
      }
    }
    return {
      ...input,
      context: mergeObject(context, input.context),
      page: mergeObject(page, input.page)
    };
  }

  // src/browser/transport.ts
  function responseResult(status, response) {
    return {
      accepted: status >= 200 && status < 300,
      response,
      retryable: status === 408 || status === 429 || status >= 500,
      status
    };
  }
  async function parseResponse(response) {
    const body = await response.text();
    if (body === "") {
      return void 0;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    return body;
  }
  async function gzipBody(json) {
    if (typeof CompressionStream === "undefined") {
      return void 0;
    }
    const compressed = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Response(compressed).blob();
  }
  function createBrowserHttpTransport(options) {
    const sendMethod = options.transport ?? "fetch";
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    return {
      async send(payload) {
        const json = JSON.stringify(payload);
        if (sendMethod === "sendBeacon" && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const accepted = navigator.sendBeacon(
            options.endpoint,
            new Blob([json], { type: "application/json" })
          );
          return { accepted, retryable: !accepted };
        }
        if (typeof fetchImplementation !== "function") {
          return { accepted: false, retryable: false };
        }
        const headers = new Headers(options.headers);
        headers.set("Content-Type", "application/json");
        let body = json;
        if (options.compression && sendMethod === "fetch") {
          const compressed = await gzipBody(json);
          if (compressed) {
            body = compressed;
            headers.set("Content-Encoding", "gzip");
          }
        }
        try {
          const response = await fetchImplementation(options.endpoint, {
            body,
            credentials: options.credentials ?? "include",
            headers,
            keepalive: sendMethod === "fetchKeepalive" || sendMethod === "sendBeacon",
            method: "POST"
          });
          return responseResult(response.status, await parseResponse(response));
        } catch (error) {
          return { accepted: false, response: error, retryable: true };
        }
      }
    };
  }

  // src/browser/index.ts
  function browserId() {
    if (typeof globalThis.crypto?.randomUUID !== "function") {
      throw new Error("crypto.randomUUID() is required; configure id_factory for older browsers");
    }
    return globalThis.crypto.randomUUID();
  }
  function resolveTransport(options) {
    if (typeof options.transport === "function") {
      return options.transport;
    }
    if (options.transport && typeof options.transport === "object") {
      return options.transport;
    }
    const transportOptions = {
      endpoint: options.endpoint ?? "/api/client-events"
    };
    if (options.compression !== void 0) transportOptions.compression = options.compression;
    if (options.credentials !== void 0) transportOptions.credentials = options.credentials;
    if (options.fetch !== void 0) transportOptions.fetch = options.fetch;
    if (options.headers !== void 0) transportOptions.headers = options.headers;
    if (options.transport !== void 0) transportOptions.transport = options.transport;
    return createBrowserHttpTransport(transportOptions);
  }
  function createJsonTag(options = {}) {
    const identity = createBrowserIdentity(options.identity, options.now ?? (() => /* @__PURE__ */ new Date()));
    const coreOptions = {
      id_factory: options.id_factory ?? browserId,
      now: options.now ?? (() => /* @__PURE__ */ new Date()),
      origin: "frontend",
      transport: resolveTransport(options)
    };
    const core = createJsonTagCore({
      ...coreOptions,
      ...options.batch === void 0 ? {} : { batch: options.batch },
      ...options.clean_payload === void 0 ? {} : { clean_payload: options.clean_payload },
      ...options.on_error === void 0 ? {} : { on_error: options.on_error },
      ...options.retry === void 0 ? {} : { retry: options.retry }
    });
    const enriching = /* @__PURE__ */ new Set();
    const sendEnriched = (input) => core.send(options.browser_context === false ? input : withBrowserContext(input));
    return {
      setIdentityConsent: identity.setConsent,
      resetIdentity: identity.reset,
      async flush() {
        await Promise.allSettled([...enriching]);
        return core.flush();
      },
      pending: () => core.pending() + enriching.size,
      async send(input) {
        const enriched = identity.enrich(input);
        if (!(enriched instanceof Promise)) return sendEnriched(enriched);
        const prepared = enriched.then((value) => {
          enriching.delete(prepared);
          return value;
        });
        enriching.add(prepared);
        try {
          return await sendEnriched(await prepared);
        } finally {
          enriching.delete(prepared);
        }
      }
    };
  }
  return __toCommonJS(index_exports);
})();
