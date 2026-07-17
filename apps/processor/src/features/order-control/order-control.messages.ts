export const englishOrderControlMessages = {
  orderControl: {
    title: "Order control",
    description:
      "Find floor work, resolve exceptions, and move eligible queued orders. {{asOf}}",
    needsAttention: "Needs attention",
    attention: "Attention",
    active: "Active",
    all: "All",
    tabLabel: "{{label}}, {{count}}",
    updating: "Updating",
    ordersNeedAttention: "Order control needs attention",
    search: "Search orders",
    searchPlaceholder: "Search order number",
    orderStatus: "Order status",
    dueWindow: "Due window",
    floorStage: "Floor stage",
    priority: "Priority",
    clearCount: "Clear {{count}}",
    loading: "Loading orders",
    noAttention: "No orders need attention",
    noMatch: "No orders match this view",
    emptyFiltered: "Clear a filter or search for a different order.",
    empty: "New order work will appear here as the floor changes.",
    clearFilters: "Clear filters",
    order: "Order",
    orderNumber: "Order {{orderId}}",
    state: "State",
    due: "Due",
    floorPosition: "Floor position",
    demand: "Demand",
    openOrder: "Open order {{orderId}}",
    openOrderShort: "Open order",
    pages: "Order pages",
    allStatuses: "All statuses",
    intakeNeeded: "Intake needed",
    attentionIntake: "Intake required",
    attentionIntakeDetail:
      "Record this order's bag count before it can be scheduled for production.",
    attentionPlacementPending: "Production position needed",
    attentionPlacementPendingDetail:
      "This eligible order is not assigned to a production batch. Review the active run and place it before floor work begins.",
    attentionPlacementConflict: "Placement changed",
    attentionPlacementConflictDetail:
      "The production queue changed before placement completed. Refresh, then review the order's current position before placing it again.",
    attentionRouteBlocked: "Production route blocked",
    attentionRouteBlockedDetail:
      "LPMS cannot find a compatible route through the order's remaining stages. Review its physical restart stage and later batch capacity.",
    eligible: "Eligible",
    notEligible: "Not eligible",
    inProduction: "In production",
    finished: "Finished",
    anyDueDate: "Any due date",
    dueToday: "Due today",
    dueTomorrow: "Due tomorrow",
    dueLater: "Due later",
    anyStage: "Any stage",
    anyPriority: "Any priority",
    priorityOnly: "Priority only",
    standardOnly: "Standard only",
    showing: "Showing {{orders}}",
    updated: "Updated {{date}}",
    errors: {
      loadFailed:
        "Orders could not be refreshed. Current results may be outdated; check your connection and refresh.",
      targetsFailed:
        "Destination batches could not be loaded. Close this action and reopen the order before choosing a batch.",
      previewFailed:
        "LPMS could not verify a safe destination. No floor change was submitted.",
      commitUnknown:
        "LPMS could not confirm the result. Refresh and verify the order's current batch before trying again.",
      conflict:
        "This order or its batch changed while the action was open. Reopen the order and review its current floor position.",
      hardCapacity:
        "No later compatible batch has enough hard capacity for this whole order at the selected restart stage. Free capacity in a later batch or keep the order with its current batch.",
      noLaterTarget:
        "This run has no later batch that can receive the order. Keep it with the current batch or plan the remaining work in a new run.",
      noFeasibleTarget:
        "No later batch can carry this whole order through every remaining required stage. Review the restart stage and later batch capacity.",
      orderUnavailable:
        "This order is no longer available in Order control. Refresh the order list.",
      orderNotScheduled:
        "This order is no longer assigned to the active production run. Refresh before taking floor action.",
      sourceBatchEmpty:
        "Moving this order would leave its current batch empty. Keep it there or rebuild the production plan.",
      weightInvalid:
        "This order does not have a valid production weight, so LPMS cannot verify hard capacity.",
      queuedSourceRequired:
        "A normal move requires the current batch to be queued and mutable. Use a floor exception only after the batch starts.",
      inFlightSourceRequired:
        "Leave-behind and rework are available only after the current batch starts.",
      stageChanged:
        "The order's current floor stage changed. Close this action, reopen the order, and choose the physical restart stage again.",
      restartSkipsWork:
        "The selected restart stage would skip unfinished work. Choose the earliest stage that still needs to be completed.",
      targetIncompatible:
        "The proposed batch no longer contains every stage this order needs. Review the order again for a compatible batch.",
      proposalStale:
        "This preview expired because the production record changed. Review the order again before confirming.",
      runClosed:
        "This production run is closed, so its order routing can no longer be changed.",
      unauthorized: "Your session expired. Sign in again before continuing.",
      forbidden:
        "Your account cannot move or reroute this order. Ask an owner or administrator to complete the action.",
      unavailable:
        "Order control cannot reach the production service. Check your connection and refresh.",
      invalidResponse:
        "The production service returned order data that Processor could not read. Refresh before continuing.",
    },
    updatedLabel: "Updated",
    bagsNotCounted: "Bags not counted",
    productionComplete: "Production complete",
    notAssigned: "Not assigned",
    batch: "Batch {{number}}",
    unassignedDetail:
      "This order is not currently assigned to a production batch.",
    positionDetail: "{{status}}{{next}}",
    nextStage: " · next: {{stage}}",
    membershipFrozen: "Membership is frozen against normal queue changes.",
    membershipMutable:
      "Membership is still mutable while this batch remains queued.",
    moveUnavailable: "Normal moves require a mutable queued source batch.",
    leaveUnavailable:
      "Leave-behind is available after the source batch starts.",
    reworkUnavailable: "Rework is available after the source batch starts.",
    automaticPlacement: "Automatic placement",
    initialSchedule: "Initial schedule",
    managerPlacement: "Manager placement",
    manualMove: "Manual queued move",
    exceptionRoute: "Floor exception route",
    queuedMoveValid: "Queued move is valid",
    floorRouteValid: "Floor route is valid",
    destinationDetail:
      "{{weight, number}} of {{capacity, number}} lb after this whole order moves.",
    releaseWork: "Release unfinished {{stages}} work from Batch {{batch}}.",
    assignWork: "Assign {{stages}} to Batch {{batch}}.",
    keepTogether:
      "Keep every bag in the customer order together and retain completed attempt history.",
    irreversible:
      "This records physical floor truth and cannot be silently undone.",
    moveWholeOrder: "Move whole order",
    confirmFloorRoute: "Confirm floor route",
    currentBatch: "This is the current batch.",
    batchImmutable: "This batch has started or its membership is frozen.",
    exceedsCapacity: "The whole order would exceed hard pulse capacity.",
    noTarget: "No mutable queued batch can receive this whole order.",
    needsMoreDrying: "Needs more drying",
    rewashRequired: "Rewash required",
    sortingIncomplete: "Sorting incomplete",
    stageIncomplete: "Stage incomplete",
    otherFloorReason: "Other floor reason",
    reviewBeforeConfirming: "Review before confirming",
    actionNotReady: "Review this order action",
    backToOrder: "Back to order",
    queuedOnly: "Queued work only",
    queuedOnlyDescription:
      "LPMS will keep the order whole, enforce hard pulse capacity, and record the manual placement. In-flight batches are not normal move targets.",
    destinationBatch: "Destination batch",
    chooseQueuedBatch: "Choose a mutable queued batch",
    changeDestination: "Change destination",
    reviewMove: "Review move",
    leaveTitle: "Leave this order behind",
    leaveDescription:
      "Record that this order cannot continue with its current batch and choose where production must resume.",
    reworkTitle: "Send this order to rework",
    reworkDescription:
      "Record the repeated production stage and review the later batch that can safely carry the work.",
    reason: "Reason",
    chooseWhatHappened: "Choose what happened",
    resumeAt: "Resume production at",
    chooseNextStage: "Choose the next required stage",
    physicalTruth:
      "Choose physical truth, not the stage LPMS currently expects.",
    nextCompatibleBatch: "Next compatible batch",
    nextCompatibleDescription:
      "LPMS will preview the earliest later batch that can carry the whole order through every required stage without exceeding hard capacity.",
    floorNote: "Floor note",
    optional: "optional",
    notePlaceholder: "What should the next employee know?",
    otherNoteRequired: "Add a short floor note when the reason is Other.",
    changeDetails: "Change details",
    reviewFloorChange: "Review floor change",
    frozen: "Frozen",
    bags: "Bags",
    placement: "Placement",
    pinned: "Pinned",
    orderActions: "Order actions",
    moveToQueued: "Move to queued batch",
    leaveBehind: "Leave behind",
    sendToRework: "Send to rework",
    moveTitle: "Move queued order",
    leaveOrderTitle: "Leave order behind",
    recordReworkTitle: "Record order rework",
    detailsTitle: "Order details",
    reviewRecord: "Review the current production record.",
  },
} as const

export const spanishOrderControlMessages = {
  orderControl: {
    title: "Control de pedidos",
    description:
      "Encuentra trabajo del piso, resuelve excepciones y mueve pedidos elegibles en cola. {{asOf}}",
    needsAttention: "Requiere atención",
    attention: "Atención",
    active: "Activos",
    all: "Todos",
    tabLabel: "{{label}}, {{count}}",
    updating: "Actualizando",
    ordersNeedAttention: "Control de pedidos requiere atención",
    search: "Buscar pedidos",
    searchPlaceholder: "Buscar número de pedido",
    orderStatus: "Estado del pedido",
    dueWindow: "Ventana de entrega",
    floorStage: "Etapa del piso",
    priority: "Prioridad",
    clearCount: "Limpiar {{count}}",
    loading: "Cargando pedidos",
    noAttention: "Ningún pedido requiere atención",
    noMatch: "Ningún pedido coincide con esta vista",
    emptyFiltered: "Limpia un filtro o busca otro pedido.",
    empty: "El trabajo nuevo aparecerá aquí a medida que cambie el piso.",
    clearFilters: "Limpiar filtros",
    order: "Pedido",
    orderNumber: "Pedido {{orderId}}",
    state: "Estado",
    due: "Entrega",
    floorPosition: "Posición en el piso",
    demand: "Demanda",
    openOrder: "Abrir pedido {{orderId}}",
    openOrderShort: "Abrir pedido",
    pages: "Páginas de pedidos",
    allStatuses: "Todos los estados",
    intakeNeeded: "Requiere recepción",
    attentionIntake: "Recepción requerida",
    attentionIntakeDetail:
      "Registra la cantidad de bolsas de este pedido antes de programarlo para producción.",
    attentionPlacementPending: "Se necesita una posición de producción",
    attentionPlacementPendingDetail:
      "Este pedido elegible no está asignado a un lote de producción. Revisa la corrida activa y asígnalo antes de iniciar el trabajo del piso.",
    attentionPlacementConflict: "La asignación cambió",
    attentionPlacementConflictDetail:
      "La cola de producción cambió antes de completar la asignación. Actualiza y revisa la posición actual del pedido antes de volver a asignarlo.",
    attentionRouteBlocked: "Ruta de producción bloqueada",
    attentionRouteBlockedDetail:
      "LPMS no puede encontrar una ruta compatible por las etapas restantes del pedido. Revisa la etapa física de reinicio y la capacidad de los lotes posteriores.",
    eligible: "Elegible",
    notEligible: "No elegible",
    inProduction: "En producción",
    finished: "Terminado",
    anyDueDate: "Cualquier fecha de entrega",
    dueToday: "Entrega hoy",
    dueTomorrow: "Entrega mañana",
    dueLater: "Entrega posterior",
    anyStage: "Cualquier etapa",
    anyPriority: "Cualquier prioridad",
    priorityOnly: "Solo prioritarios",
    standardOnly: "Solo estándar",
    showing: "Mostrando {{orders}}",
    updated: "Actualizado {{date}}",
    errors: {
      loadFailed:
        "No se pudieron actualizar los pedidos. Los resultados actuales pueden estar desactualizados; revisa tu conexión y actualiza.",
      targetsFailed:
        "No se pudieron cargar los lotes de destino. Cierra esta acción y vuelve a abrir el pedido antes de elegir un lote.",
      previewFailed:
        "LPMS no pudo verificar un destino seguro. No se envió ningún cambio del piso.",
      commitUnknown:
        "LPMS no pudo confirmar el resultado. Actualiza y verifica el lote actual del pedido antes de volver a intentarlo.",
      conflict:
        "Este pedido o su lote cambió mientras la acción estaba abierta. Vuelve a abrir el pedido y revisa su posición actual en el piso.",
      hardCapacity:
        "Ningún lote compatible posterior tiene suficiente capacidad máxima para este pedido completo en la etapa seleccionada. Libera capacidad en un lote posterior o mantén el pedido con su lote actual.",
      noLaterTarget:
        "Esta corrida no tiene un lote posterior que pueda recibir el pedido. Mantenlo con el lote actual o planifica el trabajo restante en una corrida nueva.",
      noFeasibleTarget:
        "Ningún lote posterior puede llevar este pedido completo por todas las etapas restantes. Revisa la etapa de reinicio y la capacidad de los lotes posteriores.",
      orderUnavailable:
        "Este pedido ya no está disponible en Control de pedidos. Actualiza la lista.",
      orderNotScheduled:
        "Este pedido ya no está asignado a la corrida de producción activa. Actualiza antes de tomar una acción en el piso.",
      sourceBatchEmpty:
        "Mover este pedido dejaría vacío su lote actual. Mantenlo allí o vuelve a crear el plan de producción.",
      weightInvalid:
        "Este pedido no tiene un peso de producción válido, por lo que LPMS no puede verificar la capacidad máxima.",
      queuedSourceRequired:
        "Un movimiento normal requiere que el lote actual esté en cola y se pueda modificar. Usa una excepción del piso solo después de iniciar el lote.",
      inFlightSourceRequired:
        "Dejar atrás y retrabajar solo están disponibles después de iniciar el lote actual.",
      stageChanged:
        "La etapa actual del pedido cambió. Cierra esta acción, vuelve a abrir el pedido y elige otra vez la etapa física de reinicio.",
      restartSkipsWork:
        "La etapa de reinicio seleccionada omitiría trabajo pendiente. Elige la primera etapa que todavía necesita completarse.",
      targetIncompatible:
        "El lote propuesto ya no contiene todas las etapas que necesita este pedido. Revisa el pedido otra vez para encontrar un lote compatible.",
      proposalStale:
        "Esta vista previa venció porque cambió el registro de producción. Revisa el pedido otra vez antes de confirmar.",
      runClosed:
        "Esta corrida de producción está cerrada, por lo que ya no se puede cambiar la ruta de sus pedidos.",
      unauthorized:
        "Tu sesión venció. Inicia sesión de nuevo antes de continuar.",
      forbidden:
        "Tu cuenta no puede mover ni cambiar la ruta de este pedido. Pide a un propietario o administrador que complete la acción.",
      unavailable:
        "Control de pedidos no puede comunicarse con el servicio de producción. Revisa tu conexión y actualiza.",
      invalidResponse:
        "El servicio de producción devolvió datos de pedidos que el Procesador no pudo leer. Actualiza antes de continuar.",
    },
    updatedLabel: "Actualizado",
    bagsNotCounted: "Bolsas sin contar",
    productionComplete: "Producción completa",
    notAssigned: "Sin asignar",
    batch: "Lote {{number}}",
    unassignedDetail:
      "Este pedido no está asignado actualmente a un lote de producción.",
    positionDetail: "{{status}}{{next}}",
    nextStage: " · siguiente: {{stage}}",
    membershipFrozen:
      "La membresía está bloqueada contra cambios normales de cola.",
    membershipMutable:
      "La membresía todavía puede cambiar mientras este lote siga en cola.",
    moveUnavailable:
      "Los movimientos normales requieren un lote de origen en cola y modificable.",
    leaveUnavailable:
      "Dejar atrás está disponible después de iniciar el lote de origen.",
    reworkUnavailable:
      "El retrabajo está disponible después de iniciar el lote de origen.",
    automaticPlacement: "Asignación automática",
    initialSchedule: "Plan inicial",
    managerPlacement: "Asignación del gerente",
    manualMove: "Movimiento manual en cola",
    exceptionRoute: "Ruta de excepción del piso",
    queuedMoveValid: "El movimiento en cola es válido",
    floorRouteValid: "La ruta del piso es válida",
    destinationDetail:
      "{{weight, number}} de {{capacity, number}} lb después de mover este pedido completo.",
    releaseWork:
      "Libera el trabajo pendiente de {{stages}} del lote {{batch}}.",
    assignWork: "Asigna {{stages}} al lote {{batch}}.",
    keepTogether:
      "Mantén juntas todas las bolsas del pedido y conserva el historial de intentos completados.",
    irreversible:
      "Esto registra la realidad física del piso y no se puede deshacer silenciosamente.",
    moveWholeOrder: "Mover pedido completo",
    confirmFloorRoute: "Confirmar ruta del piso",
    currentBatch: "Este es el lote actual.",
    batchImmutable: "Este lote ya inició o su membresía está bloqueada.",
    exceedsCapacity:
      "El pedido completo excedería la capacidad máxima del pulso.",
    noTarget:
      "Ningún lote modificable en cola puede recibir este pedido completo.",
    needsMoreDrying: "Necesita más secado",
    rewashRequired: "Requiere volver a lavar",
    sortingIncomplete: "Clasificación incompleta",
    stageIncomplete: "Etapa incompleta",
    otherFloorReason: "Otro motivo del piso",
    reviewBeforeConfirming: "Revisa antes de confirmar",
    actionNotReady: "Revisa esta acción del pedido",
    backToOrder: "Volver al pedido",
    queuedOnly: "Solo trabajo en cola",
    queuedOnlyDescription:
      "LPMS mantendrá el pedido completo, aplicará la capacidad máxima del pulso y registrará la asignación manual. Los lotes en curso no son destinos normales.",
    destinationBatch: "Lote de destino",
    chooseQueuedBatch: "Elige un lote modificable en cola",
    changeDestination: "Cambiar destino",
    reviewMove: "Revisar movimiento",
    leaveTitle: "Dejar este pedido atrás",
    leaveDescription:
      "Registra que este pedido no puede continuar con su lote actual y elige dónde debe reanudarse la producción.",
    reworkTitle: "Enviar este pedido a retrabajo",
    reworkDescription:
      "Registra la etapa repetida y revisa el lote posterior que puede llevar el trabajo con seguridad.",
    reason: "Motivo",
    chooseWhatHappened: "Elige qué ocurrió",
    resumeAt: "Reanudar producción en",
    chooseNextStage: "Elige la siguiente etapa requerida",
    physicalTruth:
      "Elige la realidad física, no la etapa que LPMS espera actualmente.",
    nextCompatibleBatch: "Siguiente lote compatible",
    nextCompatibleDescription:
      "LPMS mostrará el primer lote posterior que pueda llevar el pedido completo por cada etapa requerida sin exceder la capacidad máxima.",
    floorNote: "Nota del piso",
    optional: "opcional",
    notePlaceholder: "¿Qué debe saber el siguiente empleado?",
    otherNoteRequired:
      "Agrega una nota breve del piso cuando el motivo sea Otro.",
    changeDetails: "Cambiar detalles",
    reviewFloorChange: "Revisar cambio del piso",
    frozen: "Bloqueado",
    bags: "Bolsas",
    placement: "Asignación",
    pinned: "Fijado",
    orderActions: "Acciones del pedido",
    moveToQueued: "Mover a un lote en cola",
    leaveBehind: "Dejar atrás",
    sendToRework: "Enviar a retrabajo",
    moveTitle: "Mover pedido en cola",
    leaveOrderTitle: "Dejar pedido atrás",
    recordReworkTitle: "Registrar retrabajo del pedido",
    detailsTitle: "Detalles del pedido",
    reviewRecord: "Revisa el registro de producción actual.",
  },
} as const
