import { z } from 'zod';
import {
  isJsonObject,
  isJsonValue,
  type JsonObject,
  type JsonValue,
} from './json-value.ts';

/**
 * A strict JSON schema whose runtime and TypeScript meanings agree: no
 * undefined, non-finite numbers, Dates, class instances, or cyclic values.
 */
export const jsonValueSchema = z.custom<JsonValue>(isJsonValue, {
  message: 'Expected a finite JSON value.',
});

export const jsonObjectSchema = z.custom<JsonObject>(isJsonObject, {
  message: 'Expected a finite JSON object.',
});
