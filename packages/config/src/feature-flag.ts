import type { z } from 'zod';
import { envBoolean } from './boolean.js';

export const featureFlag = envBoolean.default(false);

export type FeatureFlag = z.infer<typeof featureFlag>;
