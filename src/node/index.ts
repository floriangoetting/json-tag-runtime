import {
  createJsonTagCore,
  type BatchOptions,
  type JsonTag,
  type JsonTagErrorContext,
  type JsonTagTransport,
  type JsonTagTransportFunction,
  type RetryOptions,
} from '../core/index.js';

export interface NodeJsonTagOptions {
  batch?: BatchOptions;
  clean_payload?: boolean;
  on_error?: (error: unknown, context: JsonTagErrorContext) => void;
  retry?: RetryOptions;
  transport: JsonTagTransport | JsonTagTransportFunction;
}

export function createJsonTag(options: NodeJsonTagOptions): JsonTag {
  return createJsonTagCore({
    origin: 'backend',
    transport: options.transport,
    ...(options.batch === undefined ? {} : { batch: options.batch }),
    ...(options.clean_payload === undefined ? {} : { clean_payload: options.clean_payload }),
    ...(options.on_error === undefined ? {} : { on_error: options.on_error }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
  });
}

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
