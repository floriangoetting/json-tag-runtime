import type { ProducerEventInput } from '../core/index.js';

export interface BrowserIdentityOptions {
  enabled?: boolean;
  /** Storage is untouched until consent is explicitly granted. */
  consent?: boolean;
  storage_key?: string;
  storage?: 'cookie' | 'localStorage';
  cookie?: { domain?: string; max_age_seconds?: number };
  session?: { enabled?: boolean; inactivity_minutes?: number };
}

type IdentityState = {
  device_id?: string;
  session?: { id: string; device_id: string | number; last_activity: number };
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
  const domain = options.cookie?.domain?.replace(/^\./, '').toLowerCase();
  const maxAge = options.cookie?.max_age_seconds ?? 31536000;
  if (!['cookie', 'localStorage'].includes(storage)) throw new Error('Invalid identity.storage');
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 34560000) throw new Error('identity.cookie.max_age_seconds must be between 1 and 34560000');
  if (domain && (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain) || !globalThis.location || (location.hostname !== domain && !location.hostname.endsWith(`.${domain}`)))) throw new Error('identity.cookie.domain must match this host or a parent domain');
  const cookieAttributes = `; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}${globalThis.location?.protocol === 'https:' ? '; Secure' : ''}`;
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
      if (uuid(session.id) && hasId(session.device_id) && typeof session.last_activity === 'number' && Number.isFinite(session.last_activity)) {
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
        globalThis.document.cookie = `${cookieName}=${value}; Max-Age=${maxAge}${cookieAttributes}`;
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
      else globalThis.document.cookie = `${cookieName}=; Max-Age=0${cookieAttributes}`;
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
        const needsDevice = !hasId(device.id);
        const needsSession = options.session?.enabled === true && !hasId(session.id);
        if (!needsDevice && !needsSession) return input;
        const state = read();
        const deviceId = hasId(device.id) ? device.id : state.device_id ?? globalThis.crypto.randomUUID();
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
