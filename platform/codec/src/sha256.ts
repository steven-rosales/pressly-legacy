import { z } from 'zod';

export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export type Sha256Hex = z.infer<typeof sha256HexSchema>;
