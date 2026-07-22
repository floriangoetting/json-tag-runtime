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

function stripQueryAndHash(value: string, base?: string): string | undefined {
  try {
    const url = new URL(value, base);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export function withBrowserContext(input: ProducerEventInput): ProducerEventInput {
  const page: Record<string, JsonValue> = {};
  const context: Record<string, JsonValue> = {};

  if (typeof location !== 'undefined') {
    page.path = location.pathname;
    const pageUrl = stripQueryAndHash(location.href);
    if (pageUrl) page.url = pageUrl;
  }

  if (typeof document !== 'undefined') {
    const referrer = document.referrer
      ? stripQueryAndHash(
        document.referrer,
        typeof location === 'undefined' ? undefined : location.href,
      )
      : undefined;
    if (referrer) page.referrer = referrer;
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
