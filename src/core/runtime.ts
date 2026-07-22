import { normalizeCoreOptions } from './config.js';
import { prepareEvent } from './event.js';
import type {
  FlushResult,
  JsonTag,
  JsonTagCoreOptions,
  ProducerEvent,
  ProducerEventInput,
  SendResult,
  TransportPayload,
  TransportResult,
} from './types.js';

function wait(delay: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function normalizeTransportResult(
  result: TransportResult | boolean | void,
): TransportResult {
  if (result === undefined) {
    return { accepted: true };
  }

  if (typeof result === 'boolean') {
    return { accepted: result, retryable: !result };
  }

  return result;
}

function isRetryable(result: TransportResult): boolean {
  if (result.retryable !== undefined) {
    return result.retryable;
  }

  if (result.status === undefined) {
    return !result.accepted;
  }

  return result.status === 408
    || result.status === 429
    || result.status >= 500;
}

export function createJsonTagCore(options: JsonTagCoreOptions): JsonTag {
  const config = normalizeCoreOptions(options);
  const queue: ProducerEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeFlush: Promise<FlushResult> | undefined;

  const notifyError = (
    error: unknown,
    events: ProducerEvent[],
    attempt: number,
    result?: TransportResult,
  ): void => {
    if (!config.on_error) {
      return;
    }

    const context = result === undefined
      ? { attempt, events }
      : { attempt, events, result };
    config.on_error(error, context);
  };

  const dispatch = async (events: ProducerEvent[]): Promise<TransportResult> => {
    const payload: TransportPayload = events.length === 1 ? events[0]! : events;
    let lastResult: TransportResult = { accepted: false, retryable: true };

    for (let attempt = 1; attempt <= config.retry.max_attempts; attempt += 1) {
      try {
        lastResult = normalizeTransportResult(
          await config.transport.send(payload, { attempt }),
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
          new Error('JSON Tag transport rejected the payload'),
          events,
          attempt,
          lastResult,
        );
        return lastResult;
      }

      const retryDelay = Math.min(
        config.retry.delay * (config.retry.backoff_factor ** (attempt - 1)),
        config.retry.max_delay,
      );
      await wait(retryDelay);
    }

    return lastResult;
  };

  const flushQueued = async (): Promise<FlushResult> => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    const result: FlushResult = { batches: 0, failed: 0, retained: 0, sent: 0 };
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

  const flush = (): Promise<FlushResult> => {
    if (!activeFlush) {
      activeFlush = flushQueued().finally(() => {
        activeFlush = undefined;
      });
    }

    return activeFlush;
  };

  const scheduleFlush = (): void => {
    if (timer !== undefined || activeFlush) {
      return;
    }

    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, config.batch.delay);
  };

  const send = async (input: ProducerEventInput): Promise<SendResult> => {
    const event = prepareEvent(input, config);

    if (!config.batch.enabled) {
      const transport = await dispatch([event]);
      return { event, state: 'sent', transport };
    }

    queue.push(event);
    if (queue.length >= config.batch.max_size) {
      await flush();
    } else {
      scheduleFlush();
    }

    return { event, state: 'queued' };
  };

  return {
    flush,
    pending: () => queue.length,
    send,
  };
}
