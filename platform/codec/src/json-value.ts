export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = Readonly<{
  [key: string]: JsonValue;
}>;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isJsonValueWithAncestors = (
  value: unknown,
  ancestors: WeakSet<object>,
): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValueWithAncestors(item, ancestors))
    : isPlainObject(value) &&
      Object.values(value).every((item) =>
        isJsonValueWithAncestors(item, ancestors),
      );
  ancestors.delete(value);
  return valid;
};

export const isJsonValue = (value: unknown): value is JsonValue =>
  isJsonValueWithAncestors(value, new WeakSet());

export const isJsonObject = (value: unknown): value is JsonObject =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  isJsonValue(value);
