import { useIsMobile } from '@/components/ui/use-mobile';
import {
  OrderAttentionSummary,
  OrderControlWorkspace,
} from './order-control.view';
import {
  useOrderControlWorkspaceModel,
  type OrderControlWorkspaceModelInput,
} from './order-control-workspace.model';

export function OrderControlWorkspaceContainer(
  props: OrderControlWorkspaceModelInput,
) {
  const isMobile = useIsMobile();
  const { model, callbacks } = useOrderControlWorkspaceModel(props);

  return (
    <OrderControlWorkspace
      model={model}
      callbacks={callbacks}
      isMobile={isMobile}
    />
  );
}

export function OrderAttentionSummaryContainer({
  onOpenOrders,
  ...props
}: OrderControlWorkspaceModelInput &
  Readonly<{
    onOpenOrders: () => void;
  }>) {
  const { model } = useOrderControlWorkspaceModel({ ...props, limit: 3 });

  return <OrderAttentionSummary model={model} onOpenOrders={onOpenOrders} />;
}
