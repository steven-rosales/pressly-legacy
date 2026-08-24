import {
  decode,
  defineBoundaryContract,
  defineCellContract,
} from '@pressly/cells';
import { z } from 'zod';
import {
  invalidPricingContractOutput,
  pricingContractIssues,
} from '../../../model/contract.ts';
import type {
  PricingCatalog,
  PricingItemMetadata,
} from '../../../model/pricing.ts';
import type {
  LoadPricingCatalogExpectedFailure,
  LoadPricingCatalogQuery,
} from './types.ts';

export const pricingServiceSlugSchema = z.enum(['wash-fold', 'dry-cleaning']);

export const pricingParamsSchema = z
  .object({ serviceSlug: pricingServiceSlugSchema })
  .strict();
const metadataSchema = z
  .object({
    minimumThresholdQuantity: z.number().optional(),
    displayUnitLabel: z.string().optional(),
  })
  .strict()
  .default({});
const itemSchema = z
  .object({
    service: z.string(),
    unit: z.string(),
    category: z.string(),
    name: z.string(),
    priceCents: z.number().int().nonnegative(),
    sortOrder: z.number().int(),
    metadata: metadataSchema,
  })
  .strict();
export const pricingCatalogHttpResultSchema = z
  .object({
    serviceSlug: pricingServiceSlugSchema,
    currency: z.string(),
    items: z.array(itemSchema),
    updatedAt: z.iso.datetime(),
  })
  .strict();
const failureSchema = z
  .object({
    code: z.literal('pricing_not_found'),
    serviceSlug: pricingServiceSlugSchema,
    missing: z.enum(['service', 'active-pricing-set']),
  })
  .strict();

const metadataFrom = (
  metadata: z.infer<typeof metadataSchema>,
): PricingItemMetadata => ({
  ...(metadata.minimumThresholdQuantity === undefined
    ? {}
    : { minimumThresholdQuantity: metadata.minimumThresholdQuantity }),
  ...(metadata.displayUnitLabel === undefined
    ? {}
    : { displayUnitLabel: metadata.displayUnitLabel }),
});

const catalogFrom = (
  value: z.infer<typeof pricingCatalogHttpResultSchema>,
): PricingCatalog => ({
  serviceSlug: value.serviceSlug,
  currency: value.currency,
  items: value.items.map((item) => ({
    ...item,
    metadata: metadataFrom(item.metadata),
  })),
  updatedAt: new Date(value.updatedAt),
});

const serializedCatalog = (value: PricingCatalog) => ({
  serviceSlug: value.serviceSlug,
  currency: value.currency,
  items: value.items.map((item) => ({
    service: item.service,
    unit: item.unit,
    category: item.category,
    name: item.name,
    priceCents: item.priceCents,
    sortOrder: item.sortOrder,
    metadata: { ...item.metadata },
  })),
  updatedAt: value.updatedAt.toISOString(),
});

export const loadPricingCatalogContract = defineCellContract<
  LoadPricingCatalogQuery,
  PricingCatalog,
  LoadPricingCatalogExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = pricingParamsSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(pricingContractIssues(parsed.error.issues));
    },
    encode: (query) => ({ ...query }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = pricingCatalogHttpResultSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(catalogFrom(parsed.data))
        : decode.invalid(pricingContractIssues(parsed.error.issues));
    },
    encode: (catalog) => {
      const parsed = pricingCatalogHttpResultSchema.safeParse(
        serializedCatalog(catalog),
      );
      return parsed.success
        ? parsed.data
        : invalidPricingContractOutput(
            'pricing_catalog_output_invalid',
            'A pricing catalog result violated its contract.',
            parsed.error,
          );
    },
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = failureSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(pricingContractIssues(parsed.error.issues));
    },
    encode: (failure) => ({ ...failure }),
  }),
});
