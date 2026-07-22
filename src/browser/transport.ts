import type {
  JsonTagTransport,
  TransportPayload,
  TransportResult,
} from '../core/index.js';

export type BrowserTransportName = 'fetch' | 'fetchKeepalive' | 'sendBeacon';

export interface BrowserHttpTransportOptions {
  compression?: boolean;
  credentials?: RequestCredentials;
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  transport?: BrowserTransportName;
}

function responseResult(status: number, response?: unknown): TransportResult {
  return {
    accepted: status >= 200 && status < 300,
    response,
    retryable: status === 408 || status === 429 || status >= 500,
    status,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body === '') {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  return body;
}

async function gzipBody(json: string): Promise<Blob | undefined> {
  if (typeof CompressionStream === 'undefined') {
    return undefined;
  }

  const compressed = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed).blob();
}

export function createBrowserHttpTransport(
  options: BrowserHttpTransportOptions,
): JsonTagTransport {
  const sendMethod = options.transport ?? 'fetch';
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return {
    async send(payload: TransportPayload): Promise<TransportResult> {
      const json = JSON.stringify(payload);

      if (
        sendMethod === 'sendBeacon'
        && typeof navigator !== 'undefined'
        && typeof navigator.sendBeacon === 'function'
      ) {
        const accepted = navigator.sendBeacon(
          options.endpoint,
          new Blob([json], { type: 'application/json' }),
        );
        return { accepted, retryable: !accepted };
      }

      if (typeof fetchImplementation !== 'function') {
        return { accepted: false, retryable: false };
      }

      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');
      let body: BodyInit = json;

      if (options.compression && sendMethod === 'fetch') {
        const compressed = await gzipBody(json);
        if (compressed) {
          body = compressed;
          headers.set('Content-Encoding', 'gzip');
        }
      }

      try {
        const response = await fetchImplementation(options.endpoint, {
          body,
          credentials: options.credentials ?? 'include',
          headers,
          keepalive: sendMethod === 'fetchKeepalive' || sendMethod === 'sendBeacon',
          method: 'POST',
        });
        return responseResult(response.status, await parseResponse(response));
      } catch (error) {
        return { accepted: false, response: error, retryable: true };
      }
    },
  };
}
