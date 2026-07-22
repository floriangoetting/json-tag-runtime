import {
  cleanJsonPayload,
  createJsonTagCore,
  type JsonTag,
  type JsonTagTransport,
  type JsonValue,
  type ProducerEvent,
  type TransportPayload,
  type TransportResult,
} from '../core/index.js';

export interface CompatibilityDataLayerOptions {
  dataLayerEventName: string;
  dataLayerName: string;
}

export interface CompatibilityBatchOptions {
  delay?: number | string;
  enabled?: boolean | string;
  maxRetries?: number | string;
  maxSize?: number | string;
}

export type CompatibilitySendMethod = 'fetch' | 'fetchKeepalive' | 'sendBeacon';

export interface JsonTagCompatibilityTarget extends Window {
  Blob: typeof Blob;
  CompressionStream?: typeof CompressionStream;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
  TextEncoder: typeof TextEncoder;
  __jsonTagRuntimeCompatibilityInstances?: Map<string, JsonTag>;
  console: Console;
  jsonTagSendData?: JsonTagCompatibilitySendData;
}

export type JsonTagCompatibilitySendData = (
  url: string,
  payload: Record<string, unknown>,
  enableGzip?: boolean | string,
  dataLayerOptions?: CompatibilityDataLayerOptions | false,
  sendMethod?: CompatibilitySendMethod,
  cleanPayload?: boolean,
  addCommonData?: boolean,
  xGtmServerPreviewToken?: string,
  enableBase64Fallback?: boolean,
  batchOptions?: CompatibilityBatchOptions,
) => boolean;

interface NormalizedCompatibilityBatchOptions {
  delay: number;
  enabled: boolean;
  maxRetries: number;
  maxSize: number;
}

interface CompatibilityTransportOptions {
  dataLayerOptions: CompatibilityDataLayerOptions | undefined;
  enableBase64Fallback: boolean;
  enableGzip: boolean;
  sendMethod: CompatibilitySendMethod;
  target: JsonTagCompatibilityTarget;
  url: string;
  xGtmServerPreviewToken: string | undefined;
}

function finiteNumber(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeBatchOptions(options?: CompatibilityBatchOptions): NormalizedCompatibilityBatchOptions {
  const maxSize = finiteNumber(options?.maxSize, 20);
  return {
    delay: finiteNumber(options?.delay, 150),
    enabled: options?.enabled !== false && options?.enabled !== 'false',
    maxRetries: Math.floor(finiteNumber(options?.maxRetries, 3)),
    maxSize: maxSize > 0 ? Math.floor(maxSize) : 20,
  };
}

function validEndpoint(target: JsonTagCompatibilityTarget, endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string') return false;
  const trimmed = endpoint.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return false;

  try {
    new URL(trimmed, target.location.href);
    return true;
  } catch {
    return false;
  }
}

function browserSupportsFetchKeepalive(target: JsonTagCompatibilityTarget): boolean {
  try {
    return 'keepalive' in new target.Request('');
  } catch {
    return false;
  }
}

function isCompressionStreamSafe(target: JsonTagCompatibilityTarget): boolean {
  const userAgent = target.navigator?.userAgent ?? '';
  const webKit = /AppleWebKit/i.test(userAgent)
    && !/Chrome|OPR|Edge|SamsungBrowser|Android/i.test(userAgent);
  return !webKit && typeof target.CompressionStream === 'function';
}

function pushResponse(
  target: JsonTagCompatibilityTarget,
  response: unknown,
  options?: CompatibilityDataLayerOptions,
): void {
  if (!options) return;

  const dataLayerTarget = target as unknown as Record<string, unknown>;
  const current = dataLayerTarget[options.dataLayerName];
  const dataLayer: Record<string, unknown>[] = Array.isArray(current) ? current : [];
  dataLayerTarget[options.dataLayerName] = dataLayer;

  const event: Record<string, unknown> = {
    _clear: true,
    event: options.dataLayerEventName,
  };
  if (
    response
    && typeof response === 'object'
    && Object.keys(response).length > 0
  ) {
    event.jsonclient = response;
  }
  dataLayer.push(event);
}

function base64EncodeUtf8(target: JsonTagCompatibilityTarget, value: string): string {
  const bytes = new target.TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte: number) => { binary += String.fromCharCode(byte); });
  return target.btoa(binary);
}

function unwrapPayload(payload: TransportPayload): JsonValue | JsonValue[] {
  const unwrap = (event: ProducerEvent): JsonValue => {
    const compatibilityPayload = event.compatibility_payload;
    if (compatibilityPayload === undefined) {
      throw new Error('Missing internal compatibility payload');
    }
    return compatibilityPayload as JsonValue;
  };

  return Array.isArray(payload) ? payload.map(unwrap) : unwrap(payload);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  return response.json();
}

function createCompatibilityTransport(options: CompatibilityTransportOptions): JsonTagTransport {
  return {
    async send(payload: TransportPayload): Promise<TransportResult> {
      const rawPayload = unwrapPayload(payload);
      const json = JSON.stringify(rawPayload);
      const headers = new options.target.Headers({ 'Content-Type': 'application/json' });
      if (options.xGtmServerPreviewToken) {
        headers.set('X-Gtm-Server-Preview', options.xGtmServerPreviewToken);
      }

      let method = options.sendMethod;
      if (method === 'sendBeacon' && typeof options.target.navigator?.sendBeacon !== 'function') {
        method = browserSupportsFetchKeepalive(options.target) ? 'fetchKeepalive' : 'fetch';
      }

      let endpoint = options.url;
      let body: BodyInit = json;
      if (
        options.enableGzip
        && method === 'fetch'
        && isCompressionStreamSafe(options.target)
      ) {
        const CompressionStreamConstructor = options.target.CompressionStream!;
        headers.set('Content-Encoding', 'gzip');
        const compressed = new options.target.Blob([json], { type: 'application/json' })
          .stream()
          .pipeThrough(new CompressionStreamConstructor('gzip'));
        body = await new options.target.Response(compressed).blob();
      } else if (options.enableGzip && options.enableBase64Fallback) {
        endpoint += '/ba';
        body = base64EncodeUtf8(options.target, json);
      }

      if (method === 'sendBeacon') {
        options.target.navigator.sendBeacon(endpoint, body);
        return { accepted: true };
      }

      if (method === 'fetchKeepalive') {
        headers.set('X-Keepalive-Request', '1');
      }

      try {
        const response = await options.target.fetch(endpoint, {
          body,
          credentials: 'include',
          headers,
          keepalive: method === 'fetchKeepalive',
          method: 'POST',
        });
        if (!response.ok) {
          return { accepted: false, retryable: true, status: response.status };
        }

        const responsePayload = await parseJsonResponse(response);
        pushResponse(options.target, responsePayload, options.dataLayerOptions);
        return {
          accepted: true,
          response: responsePayload,
          status: response.status,
        };
      } catch (error) {
        options.target.console?.log(error);
        return { accepted: false, response: error, retryable: true };
      }
    },
  };
}

function cloneForWire(payload: Record<string, unknown>, cleanPayload: boolean): Record<string, JsonValue> {
  if (cleanPayload) return cleanJsonPayload(payload);

  const serialized = JSON.stringify(payload);
  if (serialized === undefined) {
    throw new Error('Compatibility payload is not JSON-serializable');
  }
  return JSON.parse(serialized) as Record<string, JsonValue>;
}

function addCompatibilityBrowserContext(
  target: JsonTagCompatibilityTarget,
  payload: Record<string, JsonValue>,
): void {
  payload.page_location = target.location.href;
  payload.page_path = target.location.pathname;
  payload.page_hostname = target.location.hostname;
  payload.page_referrer = target.document.referrer;
  payload.page_title = target.document.title;
  payload.page_encoding = target.document.characterSet;
  if (target.screen) {
    payload.screen_resolution = `${target.screen.width}x${target.screen.height}`;
  }
  payload.viewport_size = target.innerWidth
    && target.innerHeight
    && `${target.innerWidth}x${target.innerHeight}`;
  if (target.navigator?.language) {
    payload.language = target.navigator.language;
  }
}

function instanceKey(
  url: string,
  enableGzip: boolean,
  dataLayerOptions: CompatibilityDataLayerOptions | undefined,
  sendMethod: CompatibilitySendMethod,
  cleanPayload: boolean,
  addCommonData: boolean,
  xGtmServerPreviewToken: string | undefined,
  enableBase64Fallback: boolean,
  batch: NormalizedCompatibilityBatchOptions,
): string {
  return JSON.stringify({
    addCommonData,
    batch,
    cleanPayload,
    dataLayerOptions: dataLayerOptions ?? null,
    enableBase64Fallback,
    enableGzip,
    sendMethod,
    url,
    xGtmServerPreviewToken: xGtmServerPreviewToken ?? null,
  });
}

export function installJsonTagCompatibility(
  target: JsonTagCompatibilityTarget,
): JsonTagCompatibilitySendData {
  const instances = target.__jsonTagRuntimeCompatibilityInstances ?? new Map<string, JsonTag>();
  target.__jsonTagRuntimeCompatibilityInstances = instances;
  let eventSequence = 0;

  const jsonTagSendData: JsonTagCompatibilitySendData = (
    url,
    originalPayload,
    enableGzip = false,
    dataLayerOptions = false,
    sendMethod = 'fetch',
    cleanPayload = false,
    addCommonData = false,
    xGtmServerPreviewToken,
    enableBase64Fallback = false,
    batchOptions,
  ) => {
    if (!validEndpoint(target, url)) {
      target.console?.log(
        '[JSON Tag] Invalid endpoint URL detected. Please double-check the JSON Tag Settings in GTM.',
      );
      return false;
    }

    const batch = normalizeBatchOptions(batchOptions);
    const shouldBatch = batch.enabled && sendMethod === 'fetch';
    const normalizedDataLayerOptions = dataLayerOptions || undefined;
    const gzipEnabled = Boolean(enableGzip);
    const key = instanceKey(
      url,
      gzipEnabled,
      normalizedDataLayerOptions,
      sendMethod,
      cleanPayload,
      addCommonData,
      xGtmServerPreviewToken,
      enableBase64Fallback,
      batch,
    );

    let runtime = instances.get(key);
    if (!runtime) {
      runtime = createJsonTagCore({
        batch: {
          delay: batch.delay,
          enabled: shouldBatch,
          max_size: batch.maxSize,
        },
        clean_payload: false,
        on_error: (error) => { target.console?.log(error); },
        origin: 'frontend',
        retain_failed: shouldBatch,
        retry: {
          backoff_factor: 1,
          delay: batch.delay,
          max_attempts: shouldBatch ? batch.maxRetries + 1 : 1,
          max_delay: batch.delay,
        },
        transport: createCompatibilityTransport({
          dataLayerOptions: normalizedDataLayerOptions,
          enableBase64Fallback,
          enableGzip: gzipEnabled,
          sendMethod,
          target,
          url,
          xGtmServerPreviewToken,
        }),
      });
      instances.set(key, runtime);
    }

    try {
      const compatibilityPayload = cloneForWire(originalPayload, cleanPayload);
      if (addCommonData) addCompatibilityBrowserContext(target, compatibilityPayload);
      eventSequence += 1;
      void runtime.send({
        event: {
          id: `compatibility-${Date.now()}-${eventSequence}`,
          name: typeof compatibilityPayload.event_name === 'string'
            ? compatibilityPayload.event_name
            : 'json_tag_event',
          occurred_at: new Date().toISOString(),
        },
        compatibility_payload: compatibilityPayload,
      });
      return true;
    } catch (error) {
      target.console?.log(error);
      return false;
    }
  };

  target.jsonTagSendData = jsonTagSendData;
  return jsonTagSendData;
}
