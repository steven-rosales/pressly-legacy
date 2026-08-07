import type { JsonValue } from '@pressly/codec';

export type ProductionValidationFailure = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  code: string;
  message: string;
  safeMessage: string;
  classification: 'malformed' | 'semantic';
  details?: JsonValue;
  publicDetails?: JsonValue;
}>;

export type ProductionNotFoundFailure = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: string;
  message: string;
  safeMessage: string;
  details?: JsonValue;
  publicDetails?: JsonValue;
}>;

export type ProductionConflictFailure = Readonly<{
  tag: 'ProductionFailure';
  kind: 'conflict';
  code: string;
  message: string;
  safeMessage: string;
  details?: JsonValue;
  publicDetails?: JsonValue;
}>;

/** Expected caller-visible Production outcomes. Unexpected faults throw. */
export type ProductionFeatureFailure =
  | ProductionValidationFailure
  | ProductionNotFoundFailure
  | ProductionConflictFailure;
