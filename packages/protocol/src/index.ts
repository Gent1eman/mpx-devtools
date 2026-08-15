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
