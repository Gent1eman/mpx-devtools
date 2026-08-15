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
