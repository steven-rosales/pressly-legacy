import type {
  PricingCatalogResult,
  PricingItemResult,
} from '@pressly/contracts/pricing';
import {
  DELIVERY_FEE_COPY,
  formatDeliveryFeeCopy,
  formatUsd,
} from '@/features/pricing/presenter';
import {
  DRY_CLEANING_PRICING,
  PRICING,
  WASH_FOLD_SPECIALTY_ITEMS,
} from '@/features/pricing/static-catalog';
import {
  LOCAL_BUSINESS_ID,
  OPENING_HOURS_SPECIFICATION,
  SCHEMA_CONTEXT,
  buildBreadcrumbNode,
  buildCanonical,
  buildJsonLdGraph,
  buildOrderAction,
  withoutUndefined,
  type BreadcrumbItem,
  type ServiceSchemaType,
  type ServiceType,
} from './site-schema';

export type BuildServiceSchemaInput = {
  name: string;
  description: string;
  path: string;
  areaName: string;
  serviceType: ServiceSchemaType;
  providerId?: string;
  includeOfferCatalog?: boolean;
  pricingCatalog?: PricingCatalogResult;
};

type BuildServicePricingPageGraphInput = {
  name: string;
  description: string;
  path: string;
  breadcrumbs: BreadcrumbItem[];
  areaName: string;
  serviceType: ServiceType;
  pricingCatalog?: PricingCatalogResult;
};

function centsToSchemaPrice(cents: number) {
  return (cents / 100).toFixed(2);
}

function priceTextToSchemaPrice(price: string) {
  return price.match(/\$([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? price;
}

function unitTextFromPriceText(price: string) {
  if (/sq\s*ft|sqft|square/i.test(price)) return 'square foot';
  if (/\blb\b|pound/i.test(price)) return 'pound';
  return 'item';
}

export function buildOfferCatalogId(path: string) {
  return `${buildCanonical(path)}#offer-catalog`;
}

function buildServiceId(path: string) {
  return `${buildCanonical(path)}#service`;
}

function buildSchemaOffer({
  name,
  price,
  unitText,
  description,
}: {
  name: string;
  price: string;
  unitText?: string | undefined;
  description?: string | undefined;
}) {
  const priceSpecification = withoutUndefined({
    '@type': unitText ? 'UnitPriceSpecification' : 'PriceSpecification',
    price,
    priceCurrency: 'USD',
    unitText,
  });

  return withoutUndefined({
    '@type': 'Offer',
    name,
    description,
    price,
    priceCurrency: 'USD',
    priceSpecification,
    itemOffered: {
      '@type': 'Service',
      name,
    },
  });
}

function buildCentsOffer({
  name,
  priceCents,
  unitText,
  description,
}: {
  name: string;
  priceCents: number;
  unitText?: string | undefined;
  description?: string | undefined;
}) {
  return buildSchemaOffer({
    name,
    price: centsToSchemaPrice(priceCents),
    unitText,
    description,
  });
}

function buildPriceTextOffer({
  name,
  price,
  description,
}: {
  name: string;
  price: string;
  description?: string | undefined;
}) {
  return buildSchemaOffer({
    name,
    price: priceTextToSchemaPrice(price),
    unitText: unitTextFromPriceText(price),
    description: description ?? price,
  });
}

function schemaUnitTextFromPricingUnit(unit: string) {
  if (unit === 'lb') return 'pound';
  if (unit === 'sqft') return 'square foot';
  if (unit === 'item') return 'item';
  return undefined;
}

function sortPricingItems(items: readonly PricingItemResult[]) {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

function findPricingItem(
  catalog: PricingCatalogResult | undefined,
  input: Readonly<{ category: string; name?: string }>,
) {
  if (catalog === undefined) return undefined;

  return sortPricingItems(catalog.items).find(
    (item) =>
      item.category === input.category &&
      (input.name === undefined || item.name === input.name),
  );
}

function buildWashFoldItemDescription(
  item: PricingItemResult,
  minimum: PricingItemResult | undefined,
) {
  const price = formatUsd(item.priceCents);

  if (item.category === 'Base') {
    const minimumText =
      minimum === undefined
        ? ''
        : ` with a ${formatUsd(minimum.priceCents)} minimum`;
    return `${price} per pound${minimumText}.`;
  }

  if (item.category === 'Minimum') {
    return `Minimum order for wash and fold laundry is ${price}.`;
  }

  if (item.category === 'Fee') {
    return formatDeliveryFeeCopy(item.priceCents);
  }

  if (item.name === 'Hang Dry') {
    return `${price} per item.`;
  }

  return `${item.name} is individually priced at ${price}.`;
}

function buildDryCleaningItemDescription(item: PricingItemResult) {
  const price = formatUsd(item.priceCents);

  if (item.category === 'Minimum') {
    return `Minimum dry cleaning order is ${price}.`;
  }

  if (item.category === 'Fee') {
    return formatDeliveryFeeCopy(item.priceCents);
  }

  if (item.category === 'Other Services') {
    return `${price} per item.`;
  }

  return `${item.name} dry cleaning is priced at ${price}.`;
}

function buildPricingItemOffer(item: PricingItemResult, description: string) {
  const name =
    item.category === 'Base'
      ? 'Wash & Fold Laundry'
      : item.category === 'Minimum' && item.service === 'wash_fold'
        ? 'Wash & Fold Minimum'
        : item.category === 'Minimum' && item.service === 'dry_cleaning'
          ? 'Dry Cleaning Minimum'
          : item.name;

  return buildCentsOffer({
    name,
    priceCents: item.priceCents,
    unitText: schemaUnitTextFromPricingUnit(item.unit),
    description,
  });
}

function buildWashFoldOfferCatalog(
  path: string,
  pricingCatalog?: PricingCatalogResult,
) {
  if (pricingCatalog !== undefined) {
    const minimum = findPricingItem(pricingCatalog, {
      category: 'Minimum',
      name: 'Minimum',
    });

    return {
      '@type': 'OfferCatalog',
      '@id': buildOfferCatalogId(path),
      name: 'Wash & Fold Pricing',
      itemListElement: sortPricingItems(pricingCatalog.items).map((item) =>
        buildPricingItemOffer(
          item,
          buildWashFoldItemDescription(item, minimum),
        ),
      ),
    };
  }

  return {
    '@type': 'OfferCatalog',
    '@id': buildOfferCatalogId(path),
    name: 'Wash & Fold Pricing',
    itemListElement: [
      buildCentsOffer({
        name: 'Wash & Fold Laundry',
        priceCents: PRICING.washFoldPerLbCents,
        unitText: 'pound',
        description: `${formatUsd(PRICING.washFoldPerLbCents)} per pound with a ${formatUsd(PRICING.washFoldMinimumCents)} minimum.`,
      }),
      buildCentsOffer({
        name: 'Wash & Fold Minimum',
        priceCents: PRICING.washFoldMinimumCents,
        description: `Minimum order for wash and fold laundry is ${formatUsd(PRICING.washFoldMinimumCents)}.`,
      }),
      buildCentsOffer({
        name: 'Delivery Fee',
        priceCents: PRICING.deliveryFeeCents,
        description: DELIVERY_FEE_COPY,
      }),
      buildCentsOffer({
        name: 'Hang Dry',
        priceCents: PRICING.hangDryCents,
        unitText: 'item',
        description: `${formatUsd(PRICING.hangDryCents)} per item.`,
      }),
      ...WASH_FOLD_SPECIALTY_ITEMS.map((item) =>
        buildPriceTextOffer({
          name: item.name,
          price: item.price,
          description: `${item.name} is individually priced at ${item.price}.`,
        }),
      ),
    ],
  };
}

function buildDryCleaningOfferCatalog(
  path: string,
  pricingCatalog?: PricingCatalogResult,
) {
  if (pricingCatalog !== undefined) {
    const standaloneItems = sortPricingItems(
      pricingCatalog.items.filter(
        (item) => item.category === 'Minimum' || item.category === 'Fee',
      ),
    );
    const otherServices = sortPricingItems(
      pricingCatalog.items.filter((item) => item.category === 'Other Services'),
    );
    const groupedItems = new Map<string, PricingItemResult[]>();

    for (const item of sortPricingItems(
      pricingCatalog.items.filter(
        (item) =>
          item.category !== 'Minimum' &&
          item.category !== 'Fee' &&
          item.category !== 'Other Services',
      ),
    )) {
      const bucket = groupedItems.get(item.category) ?? [];
      bucket.push(item);
      groupedItems.set(item.category, bucket);
    }

    return {
      '@type': 'OfferCatalog',
      '@id': buildOfferCatalogId(path),
      name: 'Dry Cleaning Pricing',
      itemListElement: [
        ...standaloneItems.map((item) =>
          buildPricingItemOffer(item, buildDryCleaningItemDescription(item)),
        ),
        ...otherServices.map((item) =>
          buildPricingItemOffer(item, buildDryCleaningItemDescription(item)),
        ),
        ...[...groupedItems.entries()].map(([title, items]) => ({
          '@type': 'OfferCatalog',
          name: title,
          itemListElement: items.map((item) =>
            buildPricingItemOffer(item, buildDryCleaningItemDescription(item)),
          ),
        })),
      ],
    };
  }

  return {
    '@type': 'OfferCatalog',
    '@id': buildOfferCatalogId(path),
    name: 'Dry Cleaning Pricing',
    itemListElement: [
      buildCentsOffer({
        name: 'Dry Cleaning Minimum',
        priceCents: PRICING.dryCleaningMinimumCents,
        description: `Minimum dry cleaning order is ${formatUsd(PRICING.dryCleaningMinimumCents)}.`,
      }),
      buildCentsOffer({
        name: 'Delivery Fee',
        priceCents: PRICING.deliveryFeeCents,
        description: DELIVERY_FEE_COPY,
      }),
      buildCentsOffer({
        name: 'Launder & Press',
        priceCents: PRICING.launderPressCents,
        unitText: 'item',
        description: `${formatUsd(PRICING.launderPressCents)} per item.`,
      }),
      ...DRY_CLEANING_PRICING.map((category) => ({
        '@type': 'OfferCatalog',
        name: category.title,
        itemListElement: category.items.map((item) =>
          buildPriceTextOffer({
            name: item.name,
            price: item.price,
            description: `${item.name} dry cleaning is priced at ${item.price}.`,
          }),
        ),
      })),
    ],
  };
}

export function buildServiceOfferCatalog(
  serviceType: ServiceType,
  path = serviceType === 'dryCleaning'
    ? '/services-pricing/dry-cleaning'
    : '/services-pricing/wash-fold',
  pricingCatalog?: PricingCatalogResult,
) {
  return serviceType === 'dryCleaning'
    ? buildDryCleaningOfferCatalog(path, pricingCatalog)
    : buildWashFoldOfferCatalog(path, pricingCatalog);
}

function getServiceLabel(serviceType: ServiceSchemaType) {
  if (serviceType === 'dryCleaning') return 'Dry cleaning service';
  if (serviceType === 'washFold') return 'Laundry service';
  return 'Laundry and dry cleaning service';
}

function buildAreaServed(areaName: string) {
  return {
    '@type': 'AdministrativeArea',
    name: areaName,
  };
}

export function buildServiceNode({
  name,
  description,
  path,
  areaName,
  serviceType,
  providerId = LOCAL_BUSINESS_ID,
  includeOfferCatalog = serviceType !== 'combined',
  pricingCatalog,
}: BuildServiceSchemaInput) {
  const catalog =
    includeOfferCatalog && serviceType !== 'combined'
      ? buildServiceOfferCatalog(serviceType, path, pricingCatalog)
      : undefined;
  const washFoldBase = findPricingItem(pricingCatalog, {
    category: 'Base',
    name: 'Wash & Fold',
  });
  const washFoldMinimum = findPricingItem(pricingCatalog, {
    category: 'Minimum',
    name: 'Minimum',
  });
  const dryCleaningMinimum = findPricingItem(pricingCatalog, {
    category: 'Minimum',
    name: 'Minimum',
  });

  return withoutUndefined({
    '@type': 'Service',
    '@id': buildServiceId(path),
    name,
    description,
    serviceType: getServiceLabel(serviceType),
    url: buildCanonical(path),
    provider: {
      '@id': providerId,
    },
    brand: {
      '@type': 'Brand',
      name: 'Pressly',
    },
    areaServed: buildAreaServed(areaName),
    hoursAvailable: [OPENING_HOURS_SPECIFICATION],
    potentialAction: buildOrderAction(),
    hasOfferCatalog: catalog ? { '@id': catalog['@id'] } : undefined,
    offers:
      serviceType === 'washFold'
        ? buildCentsOffer({
            name: 'Wash & Fold Laundry',
            priceCents: washFoldBase?.priceCents ?? PRICING.washFoldPerLbCents,
            unitText: 'pound',
            description: `${formatUsd(
              washFoldBase?.priceCents ?? PRICING.washFoldPerLbCents,
            )} per pound with a ${formatUsd(
              washFoldMinimum?.priceCents ?? PRICING.washFoldMinimumCents,
            )} minimum.`,
          })
        : serviceType === 'dryCleaning'
          ? buildCentsOffer({
              name: 'Dry Cleaning Minimum',
              priceCents:
                dryCleaningMinimum?.priceCents ??
                PRICING.dryCleaningMinimumCents,
              description: `Dry cleaning is priced per item with a ${formatUsd(
                dryCleaningMinimum?.priceCents ??
                  PRICING.dryCleaningMinimumCents,
              )} minimum.`,
            })
          : undefined,
  });
}

export function buildServiceJsonLd(input: BuildServiceSchemaInput) {
  const service = buildServiceNode(input);
  const catalog =
    input.includeOfferCatalog !== false && input.serviceType !== 'combined'
      ? buildServiceOfferCatalog(
          input.serviceType,
          input.path,
          input.pricingCatalog,
        )
      : undefined;

  if (catalog) {
    return buildJsonLdGraph([service, catalog]);
  }

  return {
    '@context': SCHEMA_CONTEXT,
    ...service,
  };
}

export function buildServicePricingPageJsonLd({
  serviceType,
  name,
  description,
  path,
  areaName,
  breadcrumbs,
  pricingCatalog,
}: BuildServicePricingPageGraphInput) {
  const service = buildServiceNode({
    name,
    description,
    path,
    areaName,
    serviceType,
    ...(pricingCatalog === undefined ? {} : { pricingCatalog }),
  });
  const catalog = buildServiceOfferCatalog(serviceType, path, pricingCatalog);

  return buildJsonLdGraph([service, catalog, buildBreadcrumbNode(breadcrumbs)]);
}
