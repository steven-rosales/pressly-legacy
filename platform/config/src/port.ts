import { z } from 'zod';

export const envPort = z.coerce.number().int().min(1).max(65535);
