import type { JsonValue, ProducerEventInput } from '../core/index.js';

function mergeObject(
  defaults: Record<string, JsonValue>,
  value: unknown,
): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  return { ...defaults, ...value } as Record<string, JsonValue>;
}
export function withBrowserContext(input: ProducerEventInput): ProducerEventInput {
  const page: Record<string, JsonValue> = {};
  const context: Record<string, JsonValue> = {};

  if (typeof location !== 'undefined') {
    page.url = location.href;
    page.path = location.pathname;
  }

  if (typeof document !== 'undefined') {
    if (document.referrer) page.referrer = document.referrer;
    if (document.title) page.title = document.title;
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    context.locale = navigator.language;
  }

  try {
    context.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Some constrained runtimes do not expose timezone data.
  }

  if (typeof window !== 'undefined') {
    context.viewport = {
      height: window.innerHeight,
      width: window.innerWidth,
    };

    if (window.screen) {
      context.screen = {
        height: window.screen.height,
        width: window.screen.width,
      };
    }
  }

  return {
    ...input,
    context: mergeObject(context, input.context),
    page: mergeObject(page, input.page),
  };
}
