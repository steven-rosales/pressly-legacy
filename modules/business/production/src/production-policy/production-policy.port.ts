import type { ProductionAdmissionPolicyPort } from './production-admission-policy.port.ts';
import type { ProductionFloorPolicyPort } from './production-floor-policy.port.ts';
import type { ProductionLifecyclePolicyPort } from './production-lifecycle-policy.port.ts';
import type { ProductionOrderRoutingPolicyPort } from './order-routing-policy.port.ts';
import type { ProductionPlanningPolicyPort } from './production-planning-policy.port.ts';

export type { PolicyDecision } from './policy-decision.port.ts';

export type ProductionPolicyPort = ProductionLifecyclePolicyPort &
  ProductionAdmissionPolicyPort &
  ProductionOrderRoutingPolicyPort &
  ProductionPlanningPolicyPort &
  ProductionFloorPolicyPort;
