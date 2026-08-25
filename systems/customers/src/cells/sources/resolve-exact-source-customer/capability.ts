import {
  resolveExactSourceCustomerV1CapabilityContract,
  type ResolveExactSourceCustomerV1Capability,
} from '../../../contracts/resolve-exact-source-customer-v1.ts';
import type { ExecuteResolveExactSourceCustomer } from './execute.ts';

export const makeResolveExactSourceCustomerV1Capability = (
  execute: ExecuteResolveExactSourceCustomer,
): ResolveExactSourceCustomerV1Capability =>
  Object.freeze({
    contract: resolveExactSourceCustomerV1CapabilityContract,
    execute,
  });
