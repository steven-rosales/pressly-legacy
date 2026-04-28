export type EventPrimitive = string | number | boolean | null;

export type EventValue = EventPrimitive | readonly EventPrimitive[];

export type EventProperties = Readonly<Record<string, EventValue>>;

export type ProductEvent<
  Name extends string = string,
  Properties extends EventProperties = EventProperties,
> = Readonly<{ name: Name; schemaVersion: number; properties: Properties }>;

/** Defines name and version, along with an object of properties */
export const defineEvent =
  <const Name extends string>(name: Name, schemaVersion = 1) =>
  <const Properties extends EventProperties>(
    properties: Properties,
  ): ProductEvent<Name, Properties> => ({ name, schemaVersion, properties });
