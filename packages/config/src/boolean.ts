import { z } from 'zod';

const trueValues = new Set(['true', '1', 'yes', 'on']);
const falseValues = new Set(['false', '0', 'no', 'off']);

export const envBoolean = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, context) => {
    if (trueValues.has(value)) return true;
    if (falseValues.has(value)) return false;

    context.addIssue({
      code: 'custom',
      message: 'Expected boolean-like env value',
    });

    return z.NEVER;
  });
