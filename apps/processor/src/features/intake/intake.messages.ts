export const englishIntakeMessages = {
  intake: {
    title: "Bag intake",
    description:
      "Confirm physical bag counts and priority before these orders enter production.",
    pending: "{{count}} pending",
    attention: "Intake needs attention",
    order: "Order {{orderId}}",
    orderDetail: "{{weight, number}} lb estimated · due {{due}}",
    bags: "Bags",
    priority: "Priority",
    record: "Record intake",
    invalidBagCount: "Bag count must be a whole number of zero or more.",
    errors: {
      changed:
        "This order changed while intake was open. The current order has been loaded; review it before recording again.",
      noLongerPending:
        "This order has already left bag intake. The current order list has been loaded.",
      orderMissing:
        "This order is no longer available for bag intake. The current order list has been loaded.",
      bagCountRejected:
        "The server rejected this bag count. Enter a whole number of zero or more and record intake again.",
      unauthorized:
        "Your session expired. Sign in again before recording bag intake.",
      forbidden:
        "Your account cannot record bag intake. Ask an owner, administrator, or production operator for access.",
      unavailable:
        "LPMS could not confirm the final intake state. Review the refreshed bag count and priority before trying again.",
      invalidResponse:
        "The production service returned order data that Processor could not read. Refresh before recording intake.",
      recordFailed:
        "Bag intake was not confirmed. Review the refreshed order before trying again.",
    },
  },
} as const

export const spanishIntakeMessages = {
  intake: {
    title: "Recepción de bolsas",
    description:
      "Confirma la cantidad física de bolsas y la prioridad antes de que estos pedidos entren a producción.",
    pending: "{{count}} pendientes",
    attention: "La recepción requiere atención",
    order: "Pedido {{orderId}}",
    orderDetail: "{{weight, number}} lb estimadas · vence {{due}}",
    bags: "Bolsas",
    priority: "Prioridad",
    record: "Registrar recepción",
    invalidBagCount:
      "La cantidad de bolsas debe ser un número entero igual o mayor que cero.",
    errors: {
      changed:
        "Este pedido cambió mientras la recepción estaba abierta. Se cargó el pedido actual; revísalo antes de registrar otra vez.",
      noLongerPending:
        "Este pedido ya salió de la recepción de bolsas. Se cargó la lista actual de pedidos.",
      orderMissing:
        "Este pedido ya no está disponible para la recepción de bolsas. Se cargó la lista actual.",
      bagCountRejected:
        "El servidor rechazó esta cantidad de bolsas. Ingresa un número entero igual o mayor que cero y registra otra vez.",
      unauthorized:
        "Tu sesión venció. Inicia sesión de nuevo antes de registrar la recepción.",
      forbidden:
        "Tu cuenta no puede registrar la recepción de bolsas. Pide acceso a un propietario, administrador u operador de producción.",
      unavailable:
        "LPMS no pudo confirmar el estado final de recepción. Revisa la cantidad de bolsas y la prioridad actualizadas antes de volver a intentarlo.",
      invalidResponse:
        "El servicio de producción devolvió datos del pedido que el Procesador no pudo leer. Actualiza antes de registrar la recepción.",
      recordFailed:
        "No se confirmó la recepción de bolsas. Revisa el pedido actualizado antes de volver a intentarlo.",
    },
  },
} as const
