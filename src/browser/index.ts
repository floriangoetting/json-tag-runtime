import {
  createJsonTagCore,
  type BatchOptions,
  type JsonTag,
  type JsonTagErrorContext,
  type JsonTagTransport,
  type JsonTagTransportFunction,
  type ProducerEventInput,
  type RetryOptions,
} from '../core/index.js';
import { withBrowserContext } from './context.js';
import {
  createBrowserHttpTransport,
  type BrowserHttpTransportOptions,
  type BrowserTransportName,
} from './transport.js';

export interface BrowserJsonTagOptions extends Omit<
  BrowserHttpTransportOptions,
  'endpoint' | 'transport'
> {
  batch?: BatchOptions;
  browser_context?: boolean;
  clean_payload?: boolean;
  endpoint?: string;
  id_factory?: () => string;
  now?: () => Date;
  on_error?: (error: unknown, context: JsonTagErrorContext) => void;
  retry?: RetryOptions;
  transport?: BrowserTransportName | JsonTagTransport | JsonTagTransportFunction;
}

function browserId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() is required; configure id_factory for older browsers');
  }

  return globalThis.crypto.randomUUID();
}

function resolveTransport(options: BrowserJsonTagOptions): JsonTagTransport | JsonTagTransportFunction {
  if (typeof options.transport === 'function') {
    return options.transport;
  }

  if (options.transport && typeof options.transport === 'object') {
    return options.transport;
  }

  const transportOptions: BrowserHttpTransportOptions = {
    endpoint: options.endpoint ?? '/api/client-events',
  };
  if (options.compression !== undefined) transportOptions.compression = options.compression;
  if (options.credentials !== undefined) transportOptions.credentials = options.credentials;
  if (options.fetch !== undefined) transportOptions.fetch = options.fetch;
  if (options.headers !== undefined) transportOptions.headers = options.headers;
  if (options.transport !== undefined) transportOptions.transport = options.transport;

  return createBrowserHttpTransport(transportOptions);
}

export function createJsonTag(options: BrowserJsonTagOptions = {}): JsonTag {
  const coreOptions = {
    id_factory: options.id_factory ?? browserId,
    now: options.now ?? (() => new Date()),
    origin: 'frontend',
    transport: resolveTransport(options),
  };
  const core = createJsonTagCore({
    ...coreOptions,
    ...(options.batch === undefined ? {} : { batch: options.batch }),
    ...(options.clean_payload === undefined ? {} : { clean_payload: options.clean_payload }),
    ...(options.on_error === undefined ? {} : { on_error: options.on_error }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
  });

  return {
    flush: core.flush,
    pending: core.pending,
    send(input: ProducerEventInput) {
      return core.send(options.browser_context === false ? input : withBrowserContext(input));
    },
  };
}

export { createBrowserHttpTransport } from './transport.js';
export type {
  BrowserHttpTransportOptions,
  BrowserTransportName,
} from './transport.js';
export type {
  BatchOptions,
  FlushResult,
  JsonTag,
  JsonTagErrorContext,
  JsonTagTransport,
  JsonTagTransportFunction,
  ProducerEvent,
  ProducerEventInput,
  RetryOptions,
  SendResult,
  TransportResult,
} from '../core/index.js';
