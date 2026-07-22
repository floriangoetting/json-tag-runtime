import { JsonTagConfigurationError } from './errors.js';
import type {
  BatchOptions,
  JsonTagCoreOptions,
  JsonTagTransport,
  RetryOptions,
} from './types.js';

export interface NormalizedBatchOptions {
  delay: number;
  enabled: boolean;
  max_size: number;
}

export interface NormalizedRetryOptions {
  backoff_factor: number;
  delay: number;
  max_attempts: number;
  max_delay: number;
}

export interface NormalizedCoreOptions extends Omit<
  JsonTagCoreOptions,
  'batch' | 'clean_payload' | 'retry' | 'transport'
> {
  batch: NormalizedBatchOptions;
  clean_payload: boolean;
  retry: NormalizedRetryOptions;
  transport: JsonTagTransport;
}

function finiteNumber(value: number | undefined, fallback: number, minimum: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < minimum) {
    throw new JsonTagConfigurationError(`Expected a finite number greater than or equal to ${minimum}`);
  }

  return value;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const normalized = finiteNumber(value, fallback, 1);
  if (!Number.isInteger(normalized)) {
    throw new JsonTagConfigurationError('Expected a positive integer');
  }

  return normalized;
}

function normalizeBatch(options: BatchOptions | undefined): NormalizedBatchOptions {
  return {
    delay: finiteNumber(options?.delay, 150, 0),
    enabled: options?.enabled ?? false,
    max_size: positiveInteger(options?.max_size, 20),
  };
}

function normalizeRetry(options: RetryOptions | undefined): NormalizedRetryOptions {
  return {
    backoff_factor: finiteNumber(options?.backoff_factor, 2, 1),
    delay: finiteNumber(options?.delay, 250, 0),
    max_attempts: positiveInteger(options?.max_attempts, 3),
    max_delay: finiteNumber(options?.max_delay, 5_000, 0),
  };
}

function normalizeTransport(
  transport: JsonTagCoreOptions['transport'],
): JsonTagTransport {
  if (typeof transport === 'function') {
    return { send: transport };
  }

  if (!transport || typeof transport.send !== 'function') {
    throw new JsonTagConfigurationError('A transport function or object with send() is required');
  }

  return transport;
}

export function normalizeCoreOptions(options: JsonTagCoreOptions): NormalizedCoreOptions {
  if (!options || typeof options !== 'object') {
    throw new JsonTagConfigurationError('A configuration object is required');
  }

  if (typeof options.origin !== 'string' || options.origin.trim() === '') {
    throw new JsonTagConfigurationError('origin must be a non-empty string');
  }

  return {
    ...options,
    batch: normalizeBatch(options.batch),
    clean_payload: options.clean_payload ?? true,
    origin: options.origin.trim(),
    retry: normalizeRetry(options.retry),
    transport: normalizeTransport(options.transport),
  };
}
