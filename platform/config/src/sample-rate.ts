import { z } from 'zod';

export const envSampleRate = z.coerce.number().min(0).max(1);
