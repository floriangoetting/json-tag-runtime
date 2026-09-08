import type { ProducerEventInput } from '../core/index.js';

export interface BrowserIdentityOptions {
  enabled?: boolean;
  /** Storage is untouched until consent is explicitly granted. */
  consent?: boolean;
  /** Disable automatic device IDs while optionally managing sessions. */
  device?: { enabled?: boolean };
  storage_key?: string;
  storage?: 'cookie' | 'localStorage';
  cookie?: { /** 'auto' (default) shares subdomains; null keeps the current host. */ domain?: string | null; max_age_seconds?: number };
  session?: { enabled?: boolean; inactivity_minutes?: number };
}

type IdentityState = {
  device_id?: string;
  session?: { id: string; device_id: string | number | null; last_activity: number };
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const hasId = (value: unknown): value is string | number =>
  (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value));
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function createBrowserIdentity(options: BrowserIdentityOptions = {}, now: () => Date) {
  const enabled = options.enabled === true;
  let consent = options.consent === true;
  const key = options.storage_key ?? 'json_tag_identity_v1';
  const storage = options.storage ?? 'cookie';
  const cookieName = encodeURIComponent(key);
  const configuredDomain = options.cookie?.domain === undefined ? 'auto' : options.cookie.domain;
  const domain = configuredDomain?.replace(/^\./, '').toLowerCase();
  const automaticDomain = domain === 'auto';
  const maxAge = options.cookie?.max_age_seconds ?? 31536000;
  if (!['cookie', 'localStorage'].includes(storage)) throw new Error('Invalid identity.storage');
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 34560000) throw new Error('identity.cookie.max_age_seconds must be between 1 and 34560000');
  if (domain && !automaticDomain && (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain) || !globalThis.location || (location.hostname !== domain && !location.hostname.endsWith(`.${domain}`)))) throw new Error('identity.cookie.domain must match this host or a parent domain');
  const cookieAttributes = (scope?: string | null) => `; Path=/; SameSite=Lax${scope ? `; Domain=${scope}` : ''}${globalThis.location?.protocol === 'https:' ? '; Secure' : ''}`;
  const parentDomains = () => {
    const host = globalThis.location?.hostname.toLowerCase() ?? '';
    if (!host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host)) return [];
    const labels = host.split('.');
    return labels.slice(1).map((_, index) => labels.slice(labels.length - index - 2).join('.'));
  };
  let resolvedDomain: string | null | undefined = automaticDomain ? undefined : domain;
  let domainResolved = !automaticDomain;
  const resolveCookieDomain = () => {
    if (domainResolved) return resolvedDomain;
    domainResolved = true;
    // Only called from a consented send. Let the browser's Public Suffix List
    // reject co.uk, github.io etc.; do not ship a stale list or guess two labels.
    const probe = `${cookieName}_domain_probe_${globalThis.crypto.randomUUID()}`;
    for (const candidate of parentDomains()) {
      try {
        globalThis.document.cookie = `${probe}=1; Max-Age=60${cookieAttributes(candidate)}`;
        const accepted = globalThis.document.cookie.split(';').some((part) => part.trim() === `${probe}=1`);
        if (accepted) { resolvedDomain = candidate; break; }
      } finally {
        globalThis.document.cookie = `${probe}=; Max-Age=0${cookieAttributes(candidate)}`;
      }
    }
    return resolvedDomain;
  };
  const readStored = () => storage === 'localStorage' ? globalThis.localStorage.getItem(key)
    : globalThis.document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const decodeStored = (raw: string) => storage === 'cookie' ? decodeURIComponent(raw) : raw;
  const minutes = options.session?.inactivity_minutes ?? 30;
  if (!key.trim()) throw new Error('identity.storage_key must not be empty');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error('identity.session.inactivity_minutes must be an integer from 1 to 1440');
  }
  let memory: IdentityState = {};
  let storageFailed = false;
  const read = (): IdentityState => {
    try {
      if (storageFailed) return memory;
      const raw = readStored();
      if (!raw) return {};
      const data = object(JSON.parse(decodeStored(raw)));
      const state: IdentityState = {};
      if (uuid(data.device_id)) state.device_id = data.device_id;
      const session = object(data.session);
      if (uuid(session.id) && (hasId(session.device_id) || session.device_id === null) && typeof session.last_activity === 'number' && Number.isFinite(session.last_activity)) {
        state.session = { id: session.id, device_id: session.device_id, last_activity: session.last_activity };
      }
      return state;
    } catch { return memory; }
  };
  const write = (state: IdentityState) => {
    memory = state;
    try {
      if (storage === 'localStorage') globalThis.localStorage.setItem(key, JSON.stringify(state));
      else {
        const value = encodeURIComponent(JSON.stringify(state));
        globalThis.document.cookie = `${cookieName}=${value}; Max-Age=${maxAge}${cookieAttributes(resolveCookieDomain())}`;
        if (readStored() !== value) storageFailed = true;
      }
    }
    catch { storageFailed = true; }
  };
  const reset = () => {
    memory = {};
    if (!enabled) return;
    try {
      if (storage === 'localStorage') globalThis.localStorage.removeItem(key);
      else {
        // Withdrawal must also work before this instance has sent anything.
        // Expire owned state at candidate scopes without creating a probe cookie.
        const scopes = automaticDomain ? [undefined, ...parentDomains()] : [domain];
        for (const scope of scopes) globalThis.document.cookie = `${cookieName}=; Max-Age=0${cookieAttributes(scope)}`;
      }
    }
    catch { storageFailed = true; }
  };
  return {
    reset,
    setConsent(granted: boolean) {
      consent = granted === true;
      if (!consent) reset();
    },
    enrich(input: ProducerEventInput): ProducerEventInput | Promise<ProducerEventInput> {
      const enrich = (): ProducerEventInput => {
        if (!enabled || !consent) return input;
        const device = object(input.device);
        const session = object(input.session);
        const needsDevice = options.device?.enabled !== false && !hasId(device.id);
        const needsSession = options.session?.enabled === true && !hasId(session.id);
        if (!needsDevice && !needsSession) return input;
        const state = read();
        const deviceId = hasId(device.id) ? device.id : needsDevice ? state.device_id ?? globalThis.crypto.randomUUID() : null;
        if (needsDevice) state.device_id = String(deviceId);
        let sessionId: string | undefined;
        if (needsSession) {
          const time = now().getTime();
          const previous = state.session;
          sessionId = previous && previous.device_id === deviceId && time >= previous.last_activity
            && time - previous.last_activity < minutes * 60000 ? previous.id : globalThis.crypto.randomUUID();
          state.session = { id: sessionId, device_id: deviceId, last_activity: time };
        }
        write(state);
        return {
          ...input,
          ...(needsDevice ? { device: { ...device, id: deviceId } } : {}),
          ...(needsSession ? { session: { ...session, id: sessionId } } : {}),
        };
      };
      if (!enabled || !consent) return input;
      // Serialize first creation and session renewal between cooperating tabs.
      if (globalThis.navigator?.locks) {
        return globalThis.navigator.locks.request(key, enrich);
      }
      return enrich();
    },
  };
}
