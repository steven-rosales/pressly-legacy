import { z } from 'zod';

export const secret = z.string().min(1).brand<'Secret'>();

export type Secret = z.infer<typeof secret>;

export const revealSecret = (value: Secret): string => value;
