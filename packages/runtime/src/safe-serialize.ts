/** Marker used when a circular reference is detected. */
export const CIRCULAR_MARKER = '[Circular]';

/** Marker used when the configured depth limit is exceeded. */
export const DEEP_MARKER = '[Deep]';

/** Marker used when an array or object exceeds its configured limit. */
export const TRUNCATED_MARKER = '[Truncated]';

/** Key added to objects that exceeded the key limit. */
export const TRUNCATED_OBJECT_KEY = '…';

/** Suffix appended to strings that exceed the length limit. */
export const STRING_TRUNCATION_SUFFIX = '…';

/** Marker used for functions. */
export const FUNCTION_MARKER = '[Function]';

/** Marker used for symbols. */
export const SYMBOL_MARKER = '[Symbol]';

/** Marker used for undefined values. */
export const UNDEFINED_MARKER = '[Undefined]';

/** Marker used when reading a property throws. */
export const ERROR_MARKER = '[Error]';

/** Marker used when a sensitive field is redacted. */
export const REDACTED_MARKER = '[Redacted]';

/** Default field names redacted during serialization (design §13.2). */
export const DEFAULT_REDACTED_KEYS = [
  'password',
  'passwd',
  'token',
  'authorization',
  'cookie',
  'secret',
  'session'
] as const;

/** A JSON-serializable value produced by safeSerialize. */
export type SafeSerialized =
  null | boolean | number | string | SafeSerialized[] | { [key: string]: SafeSerialized };

/** Limits and redaction applied while serializing (design §13.2). */
export interface SafeSerializeOptions {
  maxDepth?: number;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  /** Field names (matched case-insensitively) whose values are replaced with REDACTED_MARKER. Defaults to DEFAULT_REDACTED_KEYS; pass [] to disable. */
  redactKeys?: string[];
}

/** Serializes an unknown value into a JSON-serializable shape without throwing. */
export function safeSerialize(value: unknown, options: SafeSerializeOptions = {}): SafeSerialized {
  const maxDepth = options.maxDepth ?? 4;
  const maxStringLength = options.maxStringLength ?? 2_048;
  const maxArrayLength = options.maxArrayLength ?? 100;
  const maxObjectKeys = options.maxObjectKeys ?? 100;
  const redactKeys = new Set(
    (options.redactKeys ?? DEFAULT_REDACTED_KEYS).map((key) => key.toLowerCase())
  );
  const seen = new WeakSet<object>();

  return serialize(value, 0);

  function serialize(current: unknown, depth: number): SafeSerialized {
    if (current === null) return null;
    if (typeof current === 'string') return serializeString(current);
    if (typeof current === 'number') return Number.isFinite(current) ? current : String(current);
    if (typeof current === 'boolean') return current;
    if (typeof current === 'undefined') return UNDEFINED_MARKER;
    if (typeof current === 'function') return FUNCTION_MARKER;
    if (typeof current === 'symbol') return SYMBOL_MARKER;
    if (typeof current === 'bigint') return String(current);
    if (current instanceof Date) return current.toISOString();
    if (depth >= maxDepth) return DEEP_MARKER;

    if (Array.isArray(current)) {
      if (seen.has(current)) return CIRCULAR_MARKER;
      seen.add(current);
      const result: SafeSerialized[] = [];
      for (let index = 0; index < current.length && index < maxArrayLength; index += 1) {
        try {
          result.push(serialize(current[index], depth + 1));
        } catch {
          result.push(ERROR_MARKER);
        }
      }
      if (current.length > maxArrayLength) result.push(TRUNCATED_MARKER);
      seen.delete(current);
      return result;
    }

    if (seen.has(current)) return CIRCULAR_MARKER;
    seen.add(current);
    const result: { [key: string]: SafeSerialized } = {};
    let serializedKeys = 0;
    for (const key of Object.keys(current)) {
      if (serializedKeys >= maxObjectKeys) {
        result[TRUNCATED_OBJECT_KEY] = TRUNCATED_MARKER;
        break;
      }
      if (redactKeys.has(key.toLowerCase())) {
        result[key] = REDACTED_MARKER;
        serializedKeys += 1;
        continue;
      }
      try {
        result[key] = serialize((current as Record<string, unknown>)[key], depth + 1);
      } catch {
        result[key] = ERROR_MARKER;
      }
      serializedKeys += 1;
    }
    seen.delete(current);
    return result;
  }

  function serializeString(current: string): SafeSerialized {
    if (current.length <= maxStringLength) return current;
    return current.slice(0, maxStringLength) + STRING_TRUNCATION_SUFFIX;
  }
}
