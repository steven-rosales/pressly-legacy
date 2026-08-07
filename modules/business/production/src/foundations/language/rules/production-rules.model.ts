import type { defineProductionRules } from './production-rules.factory.ts';

/** The immutable vocabulary of intrinsic rules owned by Production. */
export type ProductionRules = ReturnType<typeof defineProductionRules>;
