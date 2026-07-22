import { useIsMobile } from "@/components/ui/use-mobile"
import { OrderControlWorkspace } from "./order-control.view"
import {
  useOrderControlWorkspaceModel,
  type OrderControlWorkspaceModelInput,
} from "./order-control-workspace.model"

export function OrderControlWorkspaceContainer(
  props: OrderControlWorkspaceModelInput
) {
  const isMobile = useIsMobile()
  const { model, callbacks } = useOrderControlWorkspaceModel(props)

  return (
    <OrderControlWorkspace
      model={model}
      callbacks={callbacks}
      isMobile={isMobile}
    />
  )
}
