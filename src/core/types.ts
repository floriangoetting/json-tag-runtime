export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ProducerEventMetadataInput {
  id?: string;
  name: string;
  occurred_at?: string;
  origin?: string;
  [key: string]: unknown;
}

export interface ProducerEventInput {
  event: ProducerEventMetadataInput;
  schema_version?: string;
  [key: string]: unknown;
}

export interface ProducerEventMetadata extends ProducerEventMetadataInput {
  id: string;
  occurred_at: string;
  origin: string;
}

export interface ProducerEvent extends ProducerEventInput {
  event: ProducerEventMetadata;
  [key: string]: JsonValue | ProducerEventMetadata | undefined;
}

export type TransportPayload = ProducerEvent | ProducerEvent[];

export interface TransportContext {
  attempt: number;
}

export interface TransportResult {
  accepted: boolean;
  response?: unknown;
  retryable?: boolean;
  status?: number;
}

export interface JsonTagTransport {
  send(
    payload: TransportPayload,
    context: TransportContext,
  ): Promise<TransportResult | boolean | void> | TransportResult | boolean | void;
}

export type JsonTagTransportFunction = JsonTagTransport['send'];

export interface BatchOptions {
  delay?: number;
  enabled?: boolean;
  max_size?: number;
}

export interface RetryOptions {
  backoff_factor?: number;
  delay?: number;
  max_attempts?: number;
  max_delay?: number;
}

export interface JsonTagErrorContext {
  attempt: number;
  events: ProducerEvent[];
  result?: TransportResult;
}

export interface JsonTagCoreOptions {
  batch?: BatchOptions;
  clean_payload?: boolean;
  id_factory?: () => string;
  now?: () => Date;
  on_error?: (error: unknown, context: JsonTagErrorContext) => void;
  origin: string;
  retain_failed?: boolean;
  retry?: RetryOptions;
  transport: JsonTagTransport | JsonTagTransportFunction;
}

export interface SendResult {
  event: ProducerEvent;
  state: 'queued' | 'sent';
  transport?: TransportResult;
}

export interface FlushResult {
  batches: number;
  failed: number;
  retained: number;
  sent: number;
}

export interface JsonTag {
  flush(): Promise<FlushResult>;
  pending(): number;
  send(input: ProducerEventInput): Promise<SendResult>;
}
