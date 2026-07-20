import type { CentsCanonicalOrderInput } from '@pressly/contracts';
import type { ApplyOrderDemandCommand } from '@pressly/production';

export const mapCentsDemandPhase = (
  status: CentsCanonicalOrderInput['status'],
): ApplyOrderDemandCommand['phase'] => {
  switch (status) {
    case 'SUBMITTED':
    case 'READY_FOR_PICKUP':
      return 'expected';
    case 'PICKED_UP':
      return 'inbound';
    case 'IN_PROGRESS':
      return 'production_released';
    case 'READY_FOR_RETURN':
    case 'OUT_FOR_DELIVERY':
    case 'COMPLETED':
      return 'post_production';
    case 'CANCELED':
      return 'withdrawn';
  }
};
