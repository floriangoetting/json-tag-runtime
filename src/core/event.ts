import { normalizeJsonObject } from './clean.js';
import { JsonTagPayloadError } from './errors.js';
import type { NormalizedCoreOptions } from './config.js';
import type {
  JsonValue,
  ProducerEvent,
  ProducerEventInput,
  ProducerEventMetadata,
} from './types.js';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new JsonTagPayloadError(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function resolveId(input: ProducerEventInput, options: NormalizedCoreOptions): string {
  if (input.event.id !== undefined) {
    return requiredString(input.event.id, 'event.id');
  }

  if (!options.id_factory) {
    throw new JsonTagPayloadError('event.id is required by this adapter');
  }

  return requiredString(options.id_factory(), 'generated event.id');
}

function resolveOccurredAt(input: ProducerEventInput, options: NormalizedCoreOptions): string {
  const occurredAt = input.event.occurred_at ?? options.now?.().toISOString();
  const normalized = requiredString(occurredAt, 'event.occurred_at');

  if (Number.isNaN(Date.parse(normalized))) {
    throw new JsonTagPayloadError('event.occurred_at must be an ISO-compatible date string');
  }

  return normalized;
}

export function prepareEvent(
  input: ProducerEventInput,
  options: NormalizedCoreOptions,
): ProducerEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new JsonTagPayloadError('Event payload must be an object');
  }

  if (!input.event || typeof input.event !== 'object' || Array.isArray(input.event)) {
    throw new JsonTagPayloadError('event must be an object');
  }

  const event: ProducerEventMetadata = {
    ...input.event,
    id: resolveId(input, options),
    name: requiredString(input.event.name, 'event.name'),
    occurred_at: resolveOccurredAt(input, options),
    origin: options.origin,
  };

  const normalized = normalizeJsonObject(
    { ...input, event },
    options.clean_payload,
  ) as Record<string, JsonValue>;

  return normalized as unknown as ProducerEvent;
}
