import { JsonTagPayloadError } from './errors.js';
import type { JsonValue } from './types.js';

const OMIT = Symbol('omit');

function isEmpty(value: JsonValue): boolean {
  return value === null
    || value === ''
    || (Array.isArray(value) && value.length === 0)
    || (
      typeof value === 'object'
      && !Array.isArray(value)
      && Object.keys(value).length === 0
    );
}

function normalizeValue(
  value: unknown,
  clean: boolean,
  ancestors: Set<object>,
  path: string,
): JsonValue | typeof OMIT {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return clean ? OMIT : (() => { throw new JsonTagPayloadError(`Unsupported value at ${path}`); })();
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return clean && isEmpty(value) ? OMIT : value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return clean ? OMIT : (() => { throw new JsonTagPayloadError(`Non-finite number at ${path}`); })();
    }

    return value;
  }

  if (typeof value === 'bigint') {
    throw new JsonTagPayloadError(`BigInt is not JSON-serializable at ${path}`);
  }

  if (typeof value !== 'object') {
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
    const result = value
      .map((item, index) => normalizeValue(item, clean, ancestors, `${path}[${index}]`))
      .filter((item): item is JsonValue => item !== OMIT);
    ancestors.delete(value);
    return clean && isEmpty(result) ? OMIT : result;
  }

  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
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

export function normalizeJsonObject(
  value: unknown,
  clean: boolean,
): Record<string, JsonValue> {
  const normalized = normalizeValue(value, clean, new Set(), '$');
  if (
    normalized === OMIT
    || normalized === null
    || Array.isArray(normalized)
    || typeof normalized !== 'object'
  ) {
    throw new JsonTagPayloadError('Event payload must be a JSON object');
  }

  return normalized;
}

export function cleanJsonPayload(value: unknown): Record<string, JsonValue> {
  return normalizeJsonObject(value, true);
}
