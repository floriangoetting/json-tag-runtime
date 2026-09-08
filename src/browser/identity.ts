import type { ProducerEventInput } from '../core/index.js';

export interface BrowserIdentityOptions {
  enabled?: boolean;
  /** Storage is untouched until consent is explicitly granted. */
  consent?: boolean;
  storage_key?: string;
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
      const raw = globalThis.localStorage.getItem(key);
      if (!raw) return {};
      const data = object(JSON.parse(raw));
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
    try { globalThis.localStorage.setItem(key, JSON.stringify(state)); }
    catch { storageFailed = true; }
  };
  const reset = () => {
    memory = {};
    if (!enabled) return;
    try { globalThis.localStorage.removeItem(key); }
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
