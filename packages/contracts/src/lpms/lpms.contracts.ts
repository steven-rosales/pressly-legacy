import { z } from 'zod';
import { productionBootstrapManifestSchema } from '../production/production.contracts.ts';
import { sourceLocationBindingResourceInputSchema } from '../webhook-ingestion/webhook-ingestion.contracts.ts';

export const lpmsBootstrapManifestSchema = productionBootstrapManifestSchema
  .safeExtend({
    sourceLocationBindings: z
      .array(sourceLocationBindingResourceInputSchema)
      .min(1),
  })
  .superRefine((manifest, context) => {
    manifest.sourceLocationBindings.forEach((binding, index) => {
      if (binding.locationId !== manifest.location.id)
        context.addIssue({
          code: 'custom',
          path: ['sourceLocationBindings', index, 'locationId'],
          message:
            'Every source-location binding must belong to the manifest location.',
        });
    });

    const seen = new Set<string>();
    manifest.sourceLocationBindings.forEach((binding, index) => {
      const key = `${binding.source}\u0000${binding.externalLocationId}`;
      if (seen.has(key))
        context.addIssue({
          code: 'custom',
          path: ['sourceLocationBindings', index],
          message: `Duplicate source-location binding: ${binding.source}:${binding.externalLocationId}.`,
        });
      seen.add(key);
    });
  });

export type LpmsBootstrapManifest = z.infer<typeof lpmsBootstrapManifestSchema>;
