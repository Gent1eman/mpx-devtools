import { z } from 'zod';

/** The only protocol version supported by the current runtime and server. */
export const PROTOCOL_VERSION = 1 as const;

/** A protocol version accepted by this release. */
export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Shared field required by all versioned protocol messages. */
export interface ProtocolVersioned {
  protocolVersion: ProtocolVersion;
}

/** Returns whether an unknown numeric value is supported by this release. */
export function isSupportedProtocolVersion(value: number): value is ProtocolVersion {
  return value === PROTOCOL_VERSION;
}

/** Runtime targets that can establish a debug session. */
export const DebugTargetSchema = z.enum(['wx', 'ios', 'android', 'harmony']);

export type DebugTarget = z.infer<typeof DebugTargetSchema>;

/** First message sent by a runtime when opening a debug session. */
export const SessionHelloSchema = z
  .object({
    type: z.literal('session.hello'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    buildId: z.string().trim().min(1),
    target: DebugTargetSchema
  })
  .strict();

export type SessionHello = z.infer<typeof SessionHelloSchema>;

/** Event delivery priority, from non-droppable critical events to low-priority events. */
export enum EventPriority {
  Critical = 0,
  High = 1,
  Normal = 2,
  Low = 3
}

export const DebugEventTypeSchema = z.enum([
  'page',
  'component',
  'lifecycle',
  'method',
  'state',
  'setData',
  'network',
  'error',
  'render',
  'probe'
]);

export type DebugEventType = z.infer<typeof DebugEventTypeSchema>;

/** Base envelope shared by every runtime event sent to the debug server. */
export const DebugEventSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    eventId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    buildId: z.string().trim().min(1),
    target: DebugTargetSchema,
    timestamp: z.number().finite().nonnegative(),
    priority: z.nativeEnum(EventPriority),
    type: DebugEventTypeSchema,
    pageInstanceId: z.string().trim().min(1).optional(),
    componentInstanceId: z.string().trim().min(1).optional(),
    semanticId: z.string().trim().min(1).optional(),
    probeId: z.string().trim().min(1).optional(),
    payload: z.unknown().optional()
  })
  .strict();

export type DebugEvent = z.infer<typeof DebugEventSchema>;

/** Page lifecycle event names emitted by the runtime. */
export const PageEventTypeSchema = z.enum(['page.create', 'page.show', 'page.hide', 'page.unload']);

export type PageEventType = z.infer<typeof PageEventTypeSchema>;

/** Page identity carried by every page lifecycle event. */
export const PageEventPayloadSchema = z
  .object({
    route: z.string().trim().min(1)
  })
  .strict();

/** Base event refined for page lifecycle notifications. */
export const PageEventSchema = DebugEventSchema.extend({
  type: PageEventTypeSchema,
  pageInstanceId: z.string().trim().min(1),
  payload: PageEventPayloadSchema
});

export type PageEvent = z.infer<typeof PageEventSchema>;

/** Component lifecycle event names emitted by the runtime. */
export const ComponentEventTypeSchema = z.enum(['component.create', 'component.destroy']);

export type ComponentEventType = z.infer<typeof ComponentEventTypeSchema>;

/** Base event refined for component lifecycle notifications. */
export const ComponentEventSchema = DebugEventSchema.extend({
  type: ComponentEventTypeSchema,
  pageInstanceId: z.string().trim().min(1),
  componentInstanceId: z.string().trim().min(1),
  parentComponentInstanceId: z.string().trim().min(1).optional()
});

export type ComponentEvent = z.infer<typeof ComponentEventSchema>;
