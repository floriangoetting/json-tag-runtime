import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createJsonTagCore,
  JsonTagPayloadError,
} from '../dist/core/index.js';

const backendEvent = (overrides = {}) => ({
  event: {
    id: 'event-1',
    name: 'listing_view',
    occurred_at: '2026-07-22T12:34:56.000Z',
    ...overrides,
  },
  listing: { id: 'listing-1' },
});

test('prepares an event without changing backend identity or time', async () => {
  const payloads = [];
  const jsonTag = createJsonTagCore({
    origin: 'backend',
    transport(payload) {
      payloads.push(payload);
    },
  });

  const result = await jsonTag.send(backendEvent());

  assert.equal(result.state, 'sent');
  assert.equal(result.event.event.id, 'event-1');
  assert.equal(result.event.event.occurred_at, '2026-07-22T12:34:56.000Z');
  assert.equal(result.event.event.origin, 'backend');
  assert.deepEqual(payloads, [result.event]);
});

test('cleans empty payload values while preserving false and zero', async () => {
  let payload;
  const jsonTag = createJsonTagCore({
    origin: 'backend',
    transport(value) {
      payload = value;
    },
  });

  await jsonTag.send({
    ...backendEvent(),
    values: {
      empty_array: [],
      empty_object: {},
      empty_string: '',
      false_value: false,
      nan: Number.NaN,
      null_value: null,
      zero: 0,
    },
  });

  assert.deepEqual(payload.values, { false_value: false, zero: 0 });
});

test('requires event IDs when no adapter ID factory is configured', async () => {
  const jsonTag = createJsonTagCore({
    origin: 'backend',
    transport() {},
  });

  await assert.rejects(
    jsonTag.send(backendEvent({ id: undefined })),
    JsonTagPayloadError,
  );
});

test('batches events and flushes at max_size', async () => {
  const payloads = [];
  const jsonTag = createJsonTagCore({
    batch: { enabled: true, delay: 60_000, max_size: 2 },
    origin: 'backend',
    transport(payload) {
      payloads.push(payload);
    },
  });

  await jsonTag.send(backendEvent({ id: 'event-1' }));
  await jsonTag.send(backendEvent({ id: 'event-2' }));

  assert.equal(jsonTag.pending(), 0);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].length, 2);
});

test('retries transient transport failures with the same event ID', async () => {
  const attempts = [];
  const jsonTag = createJsonTagCore({
    origin: 'backend',
    retry: { delay: 0, max_attempts: 3 },
    transport(payload, context) {
      attempts.push({ id: payload.event.id, attempt: context.attempt });
      return context.attempt < 3
        ? { accepted: false, status: 503 }
        : { accepted: true, status: 202 };
    },
  });

  const result = await jsonTag.send(backendEvent());

  assert.equal(result.transport.accepted, true);
  assert.deepEqual(attempts, [
    { id: 'event-1', attempt: 1 },
    { id: 'event-1', attempt: 2 },
    { id: 'event-1', attempt: 3 },
  ]);
});

test('does not retry permanent client failures', async () => {
  let attempts = 0;
  const jsonTag = createJsonTagCore({
    origin: 'backend',
    transport() {
      attempts += 1;
      return { accepted: false, status: 400 };
    },
  });

  const result = await jsonTag.send(backendEvent());

  assert.equal(result.transport.accepted, false);
  assert.equal(attempts, 1);
});

test('can retain a failed batch for a later explicit retry', async () => {
  let accepted = false;
  const jsonTag = createJsonTagCore({
    batch: { enabled: true, delay: 60_000, max_size: 1 },
    origin: 'backend',
    retain_failed: true,
    retry: { delay: 0, max_attempts: 1 },
    transport() {
      return { accepted, retryable: true, status: accepted ? 202 : 503 };
    },
  });

  await jsonTag.send(backendEvent());
  assert.equal(jsonTag.pending(), 1);

  accepted = true;
  const result = await jsonTag.flush();

  assert.deepEqual(result, { batches: 1, failed: 0, retained: 0, sent: 1 });
  assert.equal(jsonTag.pending(), 0);
});
