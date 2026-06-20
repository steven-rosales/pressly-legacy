import { z } from 'zod';
import { isUtcIso } from '@pressly/time';

export const utcIsoStringSchema = z
  .string()
  .refine(
    (value): boolean => isUtcIso(value),
    'Expected a UTC ISO datetime.',
  );
