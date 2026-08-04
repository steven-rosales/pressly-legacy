import type { CodedFailure } from '@pressly/kernel';

/** A caller-visible rejection produced by one of Production's pure rules. */
export type ProductionRuleFailure = CodedFailure;

/** @deprecated Prefer the authority-owned ProductionRuleFailure name. */
export type ProductionPolicyRejection = ProductionRuleFailure;
