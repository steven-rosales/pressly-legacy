export type CatalogMetricInstrument = 'counter' | 'gauge' | 'distribution';

export type CatalogMetricUnit = 'count' | 'second';

export type CatalogMetricAttributeValues<AttributeName extends string> =
  Readonly<Partial<Record<AttributeName, readonly string[]>>>;

export type CatalogMetricDescriptor<
  Name extends string = string,
  AttributeName extends string = string,
> = Readonly<{
  name: Name;
  instrument: CatalogMetricInstrument;
  unit: CatalogMetricUnit;
  allowedAttributes: readonly AttributeName[];
  attributeValues?: CatalogMetricAttributeValues<AttributeName>;
}>;

type AnyMetricDescriptor = CatalogMetricDescriptor<string, string>;

export type CatalogMetricDefinition<
  Descriptor extends AnyMetricDescriptor = AnyMetricDescriptor,
> = Omit<Descriptor, 'name'>;

export type ComposedMetricCatalog<
  Descriptor extends AnyMetricDescriptor = AnyMetricDescriptor,
> = Readonly<{
  [Entry in Descriptor as Entry['name']]: CatalogMetricDefinition<Entry>;
}>;

export type RuntimeMetricCatalog = Readonly<
  Record<string, CatalogMetricDefinition>
>;

export type RuntimeObservabilityCatalog = Readonly<{
  metrics: RuntimeMetricCatalog;
  operationIdFor: (operation: string) => string | undefined;
  operationIdForJobLabel: (job: string) => string | undefined;
}>;

export type MetricCatalogComposition<
  Descriptor extends AnyMetricDescriptor = AnyMetricDescriptor,
> =
  | Readonly<{
      kind: 'ready';
      catalog: ComposedMetricCatalog<Descriptor>;
    }>
  | Readonly<{
      kind: 'collision';
      duplicateNames: readonly Descriptor['name'][];
    }>;

const freezeAttributeValues = (
  values: CatalogMetricAttributeValues<string> | undefined,
): CatalogMetricAttributeValues<string> | undefined => {
  if (values === undefined) return undefined;
  for (const vocabulary of Object.values(values))
    if (vocabulary !== undefined) Object.freeze(vocabulary);
  return Object.freeze(values);
};

const freezeDescriptor = <Descriptor extends AnyMetricDescriptor>(
  descriptor: Descriptor,
): Readonly<Descriptor> => {
  Object.freeze(descriptor.allowedAttributes);
  if (descriptor.attributeValues !== undefined) {
    freezeAttributeValues(descriptor.attributeValues);
    Object.freeze(descriptor.attributeValues);
  }
  return Object.freeze(descriptor);
};

export const defineMetricDescriptors = <
  const Descriptors extends readonly AnyMetricDescriptor[],
>(
  ...descriptors: Descriptors
): Readonly<Descriptors> => {
  for (const descriptor of descriptors) freezeDescriptor(descriptor);
  return Object.freeze(descriptors);
};

type CollectionDescriptor<
  Collections extends readonly (readonly AnyMetricDescriptor[])[],
> = Collections[number][number];

export const composeMetricCatalog = <
  const Collections extends readonly (readonly AnyMetricDescriptor[])[],
>(
  ...collections: Collections
): MetricCatalogComposition<CollectionDescriptor<Collections>> => {
  const descriptors = new Map<string, AnyMetricDescriptor>();
  const duplicateNames = new Set<string>();

  for (const descriptor of collections.flat()) {
    if (descriptors.has(descriptor.name)) duplicateNames.add(descriptor.name);
    else descriptors.set(descriptor.name, descriptor);
  }

  if (duplicateNames.size > 0)
    return Object.freeze({
      kind: 'collision',
      duplicateNames: Object.freeze([...duplicateNames].sort()),
    }) as MetricCatalogComposition<CollectionDescriptor<Collections>>;

  return Object.freeze({
    kind: 'ready',
    catalog: Object.freeze(
      Object.fromEntries(
        [...descriptors].map(([name, descriptor]) => [
          name,
          Object.freeze({
            instrument: descriptor.instrument,
            unit: descriptor.unit,
            allowedAttributes: descriptor.allowedAttributes,
            ...(descriptor.attributeValues === undefined
              ? {}
              : { attributeValues: descriptor.attributeValues }),
          }),
        ]),
      ),
    ),
  }) as MetricCatalogComposition<CollectionDescriptor<Collections>>;
};
