export const englishProductionBoardMessages = {
  production: {
    batch: "Batch {{number}}",
    batchAria: "Batch {{number}}, {{stage}}, {{status}}",
    assignedMachine: "Assigned machine",
    pinned: "Pinned",
    noMachines: "No machines assigned",
    editMachines: "Edit machines",
    startNow: "Start {{stage}} now",
    startStage: "Start {{stage}}",
    completeStage: "Complete {{stage}}",
    loading: "Loading production board…",
    readingTruth: "Reading current operational truth.",
    liveRun: "Live production run",
    runDescription: "Shift {{window}} · updated {{updated}}",
    recordProgress: "Record floor progress",
    offline: "Board is offline",
    reconnecting: "Live updates are reconnecting",
    connecting: "Connecting live updates",
    offlineShort: "Offline",
    reconnectingShort: "Reconnecting",
    connectingShort: "Connecting",
    updatesPaused:
      "Production commands are paused until the live change stream is current. You can still refresh this board manually.",
    actionAttention: "Board action needs attention",
    summary: "Production summary",
    productionStatus: "Production status",
    completed: "Completed",
    planned: "Planned",
    started: "Started",
    queueLifecycle: "Queue v{{queue}} · lifecycle v{{lifecycle}}",
    scheduledDemand: "Scheduled demand",
    demandDetail: "{{batches}} · finish {{finish}}{{overtime}}",
    overtimeAcceptedSuffix: " · overtime accepted",
    stageProgress: "Stage progress",
    operatorPulses: "Operator-confirmed pulses",
    pulse: "Pulse",
    noAcceptedCapacity: "No accepted capacity",
    maximum: "{{weight, number}} lb maximum",
    pendingArrivals: "Pending arrivals",
    pendingDescription:
      "These eligible orders are visible but not yet in the live queue.",
    order: "Order {{orderId}}",
    orderDetail: "{{weight, number}} lb · {{bags}}{{priority}}",
    prioritySuffix: " · priority",
    retryAutomatic: "Retry automatic",
    runSelectionRequired: "Run selection required",
    placementPending: "Placement pending",
    automaticAttention: "Automatic placement needs attention",
    placementNoRun:
      "No production run is active. Start an accepted schedule before retrying this order.",
    placementNotAttempted:
      "Automatic placement has not run for this order. Retry automatic placement.",
    placementMultipleRuns:
      "More than one production run is active. Open the intended run before retrying placement.",
    lastProposal: "Last proposal: queue v{{queue}}, finish {{finish}}.",
    anotherRun: "Proposal belongs to another run",
    anotherRunDescription:
      "Open that run to confirm its overtime proposal, or retry automatic placement into this queue.",
    exactBatchAria: "Exact batch for order {{orderId}}",
    chooseExactBatch: "Choose exact queued batch",
    placeExactly: "Place exactly",
    overtimeRequired: "Overtime confirmation required",
    overtimeDetail:
      "This exact queue proposal adds {{minutes}} minutes and finishes at {{finish}}.",
    confirmOvertime: "Confirm overtime and place",
    managerApproval: "Owner or administrator approval is required.",
    queueMembership: "Queue membership",
    membershipFrozen: "Membership frozen",
    membershipMutable: "Membership mutable",
    freeze: "Freeze",
    unfreeze: "Unfreeze",
    noAcceptedBatches: "No accepted batches",
    noAcceptedBatchesDescription:
      "Start an accepted schedule to populate the floor board.",
    stages: "Production stages",
    fold: "Fold",
    assignMachines: "Assign {{stage}} machines",
    assignMachinesDescription:
      "Batch {{batch}} needs {{weight, number}} lb of active compatible capacity. Saving replaces the full machine set for this stage.",
    activeCompatibleMachines: "Active compatible machines",
    assignmentFailed: "Machine assignment not saved",
    selectedCapacity: "Selected capacity",
    insufficientCapacity:
      "The server will reject capacity below the batch demand.",
    saveMachines: "Save machines",
    completeEarlyTitle: "Complete this stage early?",
    pulseStillRunning: "The planned pulse is still running.",
    completeEarlyDescription:
      "{{stage}} has run for {{elapsed}} of its {{planned}} planned pulse. {{remaining}} remains.",
    keepRunning: "Keep running",
    completeEarly: "Complete early",
    checkReadiness: "Checking readiness…",
    secondsRemaining: "{{seconds}}s remaining",
    minutesRemaining: "{{minutes}}m remaining",
    hoursRemaining: "{{hours}}h remaining",
    hoursMinutesRemaining: "{{hours}}h {{minutes}}m remaining",
    hoursShort: "{{hours}} hr",
    hoursMinutesShort: "{{hours}} hr {{minutes}} min",
    statusCompleted: "Completed",
    readyToStart: "Ready to start",
    readyToComplete: "Ready to complete",
    serverAuthorized: "Authorized by the server",
    scheduledToStart: "Scheduled to start",
    startIfReady: "Start now if the batch is physically ready.",
    inProgress: "In progress",
    earlyConfirmation:
      "Completing before the planned pulse ends requires confirmation.",
    needsMachines: "Needs machines",
    waitingPrevious: "Waiting for previous stage",
    resourceOccupied: "Resource occupied",
    upcoming: "Upcoming",
    waitingClearance: "Waiting for server clearance",
    waitingForRun: "Waiting for production to start",
    stageNeedsMachinesDetail:
      "Assign enough active compatible machines before starting this stage.",
    stagePreviousIncompleteDetail:
      "Complete the previous stage for this batch before starting this one.",
    stageKindActiveDetail:
      "Another batch is active in this stage. Complete it before starting this batch.",
    stageMachineOverlapDetail:
      "One or more assigned machines are already in use. Choose free compatible machines.",
    stageRunNotStartedDetail:
      "Start the accepted production run before starting this batch.",
    startStageNowTitle: "Start {{stage}} now?",
    thisStage: "this stage",
    earlierThanPlanned: "This stage is earlier than planned.",
    earlyStartDescription:
      "It is planned for {{time}}, {{remaining}} from now. Start only if the batch is physically ready. The original plan will not change.",
    notYet: "Not yet",
    startNowShort: "Start now",
    canStartAfterConfirmation: "{{stage}} can start now after confirmation.",
    canCompleteAfterConfirmation:
      "{{stage}} can be completed early after confirmation.",
    stageStarted: "{{stage}} started.",
    stageCompleted: "{{stage}} completed.",
    selectMachine: "Select at least one active machine for this stage.",
    machinesAssigned: "{{stage}} machines assigned.",
    batchFrozen: "Batch {{batch}} frozen.",
    batchUnfrozen: "Batch {{batch}} unfrozen.",
    orderNeedsOvertime: "Order {{orderId}} needs an overtime confirmation.",
    orderPlaced: "Order {{orderId}} was placed.",
    chooseMutableBatch: "Choose a mutable queued batch for exact placement.",
    floorRecorded: "Batch {{batch}} floor progress recorded{{closed}}",
    shiftClosedSuffix: "; the shift is closed.",
    period: ".",
    batchMissing: "The selected batch is no longer on this board.",
    floorReady: "Batch {{batch}} progress is ready to confirm.",
    errors: {
      boardLoadFailed:
        "The production board could not be refreshed. Current floor data may be outdated; check your connection and refresh.",
      boardMissing:
        "This production run no longer has an active board. Return to Schedule or History and open a current run.",
      runClosed:
        "This production run is complete or its shift is closed. The board is now read-only.",
      runNotStarted:
        "This production run has not started yet. Start its accepted schedule before recording floor work.",
      recordChanged:
        "Production changed while this action was open. The board has been refreshed; review the current stage, batch, and order before acting again.",
      stageMissing:
        "This stage is no longer on the current board. Review the refreshed batch before continuing.",
      plannedStartNotReached:
        "This stage is not scheduled to start yet. Wait for its planned start or use the early-start confirmation shown by Processor.",
      pulseBoundaryNotReached:
        "This stage has not reached its planned pulse boundary. Wait for the boundary or use the early-completion confirmation shown by Processor.",
      confirmationStale:
        "This confirmation expired because production changed. Review the refreshed stage and request a new confirmation.",
      machineMissing:
        "A selected machine no longer exists. Review the active machine list and choose again.",
      machineUnavailable:
        "A selected machine is inactive or unavailable. Choose an active machine that is free for this stage.",
      machineDuplicated:
        "A machine cannot be assigned to two active stage runs at the same time. Review the other active batches and choose again.",
      machineWrongStage:
        "A selected machine is not approved for this production stage. Choose a compatible machine.",
      machineCapacity:
        "The selected machines do not provide enough capacity for this batch. Add compatible active machines before assigning.",
      batchMissing:
        "This batch is no longer on the current board. Review the refreshed production run.",
      alreadyFrozen: "This batch is already frozen; no change was needed.",
      alreadyMutable: "This batch is already mutable; no change was needed.",
      freezeForbidden:
        "This batch cannot be frozen in its current state. Only eligible queued work can be frozen.",
      unfreezeForbidden:
        "This batch cannot be made mutable after production has started or membership became immutable.",
      membershipImmutable:
        "This batch has started, so normal membership changes are no longer allowed. Use Order control for a floor exception.",
      orderAlreadyPlaced:
        "This order is already assigned to production. Review its current batch before taking another placement action.",
      orderNotEligible:
        "This order is not eligible for production. Complete intake and resolve its eligibility before placing it.",
      orderNotReady:
        "This order is not ready for this production run. Refresh and review its current state.",
      hardCapacity:
        "This whole order would exceed the selected batch's hard pulse capacity. Choose a batch with enough remaining capacity.",
      noMutableBatch:
        "No queued mutable batch can receive this whole order. Review batch state and hard capacity before trying again.",
      placementForbidden:
        "This placement is not allowed for the order or batch in its current state. Review the refreshed board.",
      overtimeRequired:
        "This order would finish after the shift. Review and confirm the overtime estimate before placing it.",
      overtimeStale:
        "The overtime estimate changed. Review the refreshed completion time and request a new confirmation.",
      floorPreviewFailed:
        "LPMS could not verify the proposed floor progress. No reconciliation was submitted; review the refreshed batch.",
      floorCommitUnknown:
        "LPMS could not confirm the reconciliation result. Refresh and verify the batch's recorded stage before trying again.",
      actionUnknown:
        "Processor could not confirm the action result. The board was refreshed; verify the current floor state before trying again.",
      unauthorized: "Your session expired. Sign in again before continuing.",
      forbidden:
        "Your account cannot complete this production action. Ask an owner or administrator for access.",
      unavailable:
        "The production board cannot reach the service. Check your connection and refresh.",
      invalidResponse:
        "The production service returned board data that Processor could not read. Refresh before continuing.",
    },
  },
  floorProgress: {
    title: "Record floor progress",
    description:
      "Use this when the board is behind what physically happened. Planned times stay unchanged, and missed event times remain unrecorded.",
    batch: "Batch",
    batchOption: "Batch {{number}} · {{weight, number}} lb",
    currentRecord: "Current record",
    currentFloorState: "Current floor state",
    alreadyFinished: "This batch is already recorded as finished.",
    reviewChange: "Review the recorded change",
    finishedConsequences: "Finished consequences",
    machines: "{{stage}} machines",
    machineHelp:
      "Select the machines this batch is using now. Historical machine use stays unrecorded.",
    noMachines: "No active compatible machines",
    noMachinesDescription:
      "Add or activate a compatible machine before recording this stage as active.",
    whyBehind: "Why is the board behind?",
    note: "Note",
    optional: "optional",
    notePlaceholder: "Anything the next operator should know",
    otherNoteRequired: "Add a short note when the reason is Something else.",
    ready: "Ready to record",
    readyDescription:
      "The server rechecked queue v{{queue}}, Batch {{batch}}, and all four stage versions. Confirm to make this the floor record.",
    failed: "Review recorded progress",
    keepCurrent: "Keep current record",
    changeDetails: "Change details",
    review: "Review progress",
    confirm: "Confirm and record",
    lpmsUnavailable: "LPMS was unavailable",
    updatesMissed: "Updates were missed",
    somethingElse: "Something else",
    waitingToSort: "Waiting to sort",
    sorting: "Sorting",
    waitingToWash: "Waiting to wash",
    washing: "Washing",
    waitingToDry: "Waiting to dry",
    drying: "Drying",
    waitingToFold: "Waiting to fold & package",
    foldingPackaging: "Folding & packaging",
    finished: "Finished",
    noChanges: "No stage changes will be recorded.",
    markOne: "This will mark {{first}}.",
    markTwo: "This will mark {{first}}, then {{second}}.",
    markMany: "This will mark {{earlier}}, then {{last}}.",
    stageStarted: "{{stage}} started",
    stageCompleted: "{{stage}} completed",
    finishConsequences: "This finishes {{orders}} and {{bags}}.",
    closeRun:
      "Because this is the last unfinished batch, the production run and shift will close.",
  },
} as const

export const spanishProductionBoardMessages = {
  production: {
    batch: "Lote {{number}}",
    batchAria: "Lote {{number}}, {{stage}}, {{status}}",
    assignedMachine: "Máquina asignada",
    pinned: "Fijado",
    noMachines: "Sin máquinas asignadas",
    editMachines: "Editar máquinas",
    startNow: "Iniciar {{stage}} ahora",
    startStage: "Iniciar {{stage}}",
    completeStage: "Completar {{stage}}",
    loading: "Cargando tablero de producción…",
    readingTruth: "Leyendo el estado operativo actual.",
    liveRun: "Corrida de producción en vivo",
    runDescription: "Turno {{window}} · actualizado {{updated}}",
    recordProgress: "Registrar progreso del piso",
    offline: "El tablero está sin conexión",
    reconnecting: "Las actualizaciones en vivo se están reconectando",
    connecting: "Conectando actualizaciones en vivo",
    offlineShort: "Sin conexión",
    reconnectingShort: "Reconectando",
    connectingShort: "Conectando",
    updatesPaused:
      "Los comandos de producción están pausados hasta que la transmisión en vivo esté actualizada. Todavía puedes actualizar el tablero manualmente.",
    actionAttention: "La acción del tablero requiere atención",
    summary: "Resumen de producción",
    productionStatus: "Estado de producción",
    completed: "Completado",
    planned: "Planificado",
    started: "Iniciado",
    queueLifecycle: "Cola v{{queue}} · ciclo v{{lifecycle}}",
    scheduledDemand: "Demanda planificada",
    demandDetail: "{{batches}} · termina {{finish}}{{overtime}}",
    overtimeAcceptedSuffix: " · tiempo extra aceptado",
    stageProgress: "Progreso de etapas",
    operatorPulses: "Pulsos confirmados por el operador",
    pulse: "Pulso",
    noAcceptedCapacity: "Sin capacidad aceptada",
    maximum: "Máximo de {{weight, number}} lb",
    pendingArrivals: "Llegadas pendientes",
    pendingDescription:
      "Estos pedidos elegibles están visibles, pero aún no están en la cola activa.",
    order: "Pedido {{orderId}}",
    orderDetail: "{{weight, number}} lb · {{bags}}{{priority}}",
    prioritySuffix: " · prioridad",
    retryAutomatic: "Reintentar automático",
    runSelectionRequired: "Se requiere seleccionar una corrida",
    placementPending: "Asignación pendiente",
    automaticAttention: "La asignación automática requiere atención",
    placementNoRun:
      "No hay una corrida de producción activa. Inicia un plan aceptado antes de volver a intentar este pedido.",
    placementNotAttempted:
      "La asignación automática todavía no se ha ejecutado para este pedido. Vuelve a intentarla.",
    placementMultipleRuns:
      "Hay más de una corrida de producción activa. Abre la corrida correcta antes de volver a intentar la asignación.",
    lastProposal: "Última propuesta: cola v{{queue}}, termina {{finish}}.",
    anotherRun: "La propuesta pertenece a otra corrida",
    anotherRunDescription:
      "Abre esa corrida para confirmar su propuesta de tiempo extra o vuelve a intentar la asignación automática en esta cola.",
    exactBatchAria: "Lote exacto para el pedido {{orderId}}",
    chooseExactBatch: "Elige un lote exacto en cola",
    placeExactly: "Asignar exactamente",
    overtimeRequired: "Se requiere confirmar el tiempo extra",
    overtimeDetail:
      "Esta propuesta exacta agrega {{minutes}} minutos y termina a las {{finish}}.",
    confirmOvertime: "Confirmar tiempo extra y asignar",
    managerApproval:
      "Se requiere aprobación de un propietario o administrador.",
    queueMembership: "Membresía de la cola",
    membershipFrozen: "Membresía bloqueada",
    membershipMutable: "Membresía modificable",
    freeze: "Bloquear",
    unfreeze: "Desbloquear",
    noAcceptedBatches: "No hay lotes aceptados",
    noAcceptedBatchesDescription:
      "Inicia un plan aceptado para llenar el tablero del piso.",
    stages: "Etapas de producción",
    fold: "Doblado",
    assignMachines: "Asignar máquinas de {{stage}}",
    assignMachinesDescription:
      "El lote {{batch}} necesita {{weight, number}} lb de capacidad activa compatible. Al guardar se reemplaza todo el conjunto de máquinas para esta etapa.",
    activeCompatibleMachines: "Máquinas activas compatibles",
    assignmentFailed: "No se guardó la asignación de máquinas",
    selectedCapacity: "Capacidad seleccionada",
    insufficientCapacity:
      "El servidor rechazará una capacidad menor que la demanda del lote.",
    saveMachines: "Guardar máquinas",
    completeEarlyTitle: "¿Completar esta etapa antes de tiempo?",
    pulseStillRunning: "El pulso planificado todavía está en curso.",
    completeEarlyDescription:
      "{{stage}} ha estado en curso durante {{elapsed}} de su pulso planificado de {{planned}}. Faltan {{remaining}}.",
    keepRunning: "Mantener en curso",
    completeEarly: "Completar antes",
    checkReadiness: "Verificando disponibilidad…",
    secondsRemaining: "Faltan {{seconds}} s",
    minutesRemaining: "Faltan {{minutes}} min",
    hoursRemaining: "Faltan {{hours}} h",
    hoursMinutesRemaining: "Faltan {{hours}} h {{minutes}} min",
    hoursShort: "{{hours}} h",
    hoursMinutesShort: "{{hours}} h {{minutes}} min",
    statusCompleted: "Completado",
    readyToStart: "Listo para iniciar",
    readyToComplete: "Listo para completar",
    serverAuthorized: "Autorizado por el servidor",
    scheduledToStart: "Programado para iniciar",
    startIfReady: "Inicia ahora si el lote está físicamente listo.",
    inProgress: "En curso",
    earlyConfirmation:
      "Completar antes de que termine el pulso planificado requiere confirmación.",
    needsMachines: "Necesita máquinas",
    waitingPrevious: "Esperando la etapa anterior",
    resourceOccupied: "Recurso ocupado",
    upcoming: "Próximo",
    waitingClearance: "Esperando autorización del servidor",
    waitingForRun: "Esperando que inicie la producción",
    stageNeedsMachinesDetail:
      "Asigna suficientes máquinas activas y compatibles antes de iniciar esta etapa.",
    stagePreviousIncompleteDetail:
      "Completa la etapa anterior de este lote antes de iniciar esta.",
    stageKindActiveDetail:
      "Otro lote está activo en esta etapa. Complétalo antes de iniciar este lote.",
    stageMachineOverlapDetail:
      "Una o más máquinas asignadas ya están en uso. Elige máquinas compatibles que estén libres.",
    stageRunNotStartedDetail:
      "Inicia la corrida de producción aceptada antes de iniciar este lote.",
    startStageNowTitle: "¿Iniciar {{stage}} ahora?",
    thisStage: "esta etapa",
    earlierThanPlanned: "Esta etapa está adelantada al plan.",
    earlyStartDescription:
      "Está planificada para {{time}}, dentro de {{remaining}}. Inicia solo si el lote está físicamente listo. El plan original no cambiará.",
    notYet: "Todavía no",
    startNowShort: "Iniciar ahora",
    canStartAfterConfirmation:
      "{{stage}} puede iniciar ahora después de confirmar.",
    canCompleteAfterConfirmation:
      "{{stage}} puede completarse antes después de confirmar.",
    stageStarted: "{{stage}} iniciada.",
    stageCompleted: "{{stage}} completada.",
    selectMachine: "Selecciona al menos una máquina activa para esta etapa.",
    machinesAssigned: "Máquinas de {{stage}} asignadas.",
    batchFrozen: "Lote {{batch}} bloqueado.",
    batchUnfrozen: "Lote {{batch}} desbloqueado.",
    orderNeedsOvertime:
      "El pedido {{orderId}} necesita confirmar el tiempo extra.",
    orderPlaced: "El pedido {{orderId}} fue asignado.",
    chooseMutableBatch:
      "Elige un lote modificable en cola para la asignación exacta.",
    floorRecorded: "Progreso del piso del lote {{batch}} registrado{{closed}}",
    shiftClosedSuffix: "; el turno está cerrado.",
    period: ".",
    batchMissing: "El lote seleccionado ya no está en este tablero.",
    floorReady: "El progreso del lote {{batch}} está listo para confirmar.",
    errors: {
      boardLoadFailed:
        "No se pudo actualizar el tablero de producción. Los datos actuales pueden estar desactualizados; revisa tu conexión y actualiza.",
      boardMissing:
        "Esta corrida de producción ya no tiene un tablero activo. Vuelve a Planificación o Historial y abre una corrida actual.",
      runClosed:
        "Esta corrida terminó o su turno está cerrado. El tablero ahora es de solo lectura.",
      runNotStarted:
        "Esta corrida todavía no comenzó. Inicia su plan aceptado antes de registrar trabajo del piso.",
      recordChanged:
        "La producción cambió mientras esta acción estaba abierta. El tablero se ha actualizado; revisa la etapa, el lote y el pedido actuales antes de actuar otra vez.",
      stageMissing:
        "Esta etapa ya no está en el tablero actual. Revisa el lote actualizado antes de continuar.",
      plannedStartNotReached:
        "Esta etapa todavía no debe iniciar. Espera hasta la hora planificada o usa la confirmación de inicio adelantado que muestra el Procesador.",
      pulseBoundaryNotReached:
        "Esta etapa todavía no llegó al límite planificado del pulso. Espera o usa la confirmación de finalización adelantada que muestra el Procesador.",
      confirmationStale:
        "Esta confirmación venció porque cambió la producción. Revisa la etapa actualizada y solicita una confirmación nueva.",
      machineMissing:
        "Una máquina seleccionada ya no existe. Revisa la lista de máquinas activas y elige otra vez.",
      machineUnavailable:
        "Una máquina seleccionada está inactiva o no disponible. Elige una máquina activa y libre para esta etapa.",
      machineDuplicated:
        "Una máquina no puede estar asignada a dos etapas activas al mismo tiempo. Revisa los otros lotes activos y elige otra vez.",
      machineWrongStage:
        "Una máquina seleccionada no está aprobada para esta etapa. Elige una máquina compatible.",
      machineCapacity:
        "Las máquinas seleccionadas no tienen suficiente capacidad para este lote. Agrega máquinas activas compatibles antes de asignar.",
      batchMissing:
        "Este lote ya no está en el tablero actual. Revisa la corrida de producción actualizada.",
      alreadyFrozen: "Este lote ya está bloqueado; no fue necesario cambiarlo.",
      alreadyMutable:
        "Este lote ya se puede modificar; no fue necesario cambiarlo.",
      freezeForbidden:
        "Este lote no se puede bloquear en su estado actual. Solo se puede bloquear trabajo elegible en cola.",
      unfreezeForbidden:
        "Este lote no se puede volver modificable después de iniciar la producción o fijar su membresía.",
      membershipImmutable:
        "Este lote ya comenzó, por lo que no admite cambios normales de membresía. Usa Control de pedidos para una excepción del piso.",
      orderAlreadyPlaced:
        "Este pedido ya está asignado a producción. Revisa su lote actual antes de tomar otra acción.",
      orderNotEligible:
        "Este pedido no es elegible para producción. Completa la recepción y resuelve su elegibilidad antes de asignarlo.",
      orderNotReady:
        "Este pedido no está listo para esta corrida. Actualiza y revisa su estado actual.",
      hardCapacity:
        "Este pedido completo excedería la capacidad máxima del lote seleccionado. Elige un lote con suficiente capacidad restante.",
      noMutableBatch:
        "Ningún lote modificable en cola puede recibir este pedido completo. Revisa el estado y la capacidad máxima de los lotes.",
      placementForbidden:
        "Esta asignación no está permitida para el pedido o lote en su estado actual. Revisa el tablero actualizado.",
      overtimeRequired:
        "Este pedido terminaría después del turno. Revisa y confirma el cálculo de tiempo extra antes de asignarlo.",
      overtimeStale:
        "El cálculo de tiempo extra cambió. Revisa la hora de finalización actualizada y solicita una confirmación nueva.",
      floorPreviewFailed:
        "LPMS no pudo verificar el progreso propuesto. No se envió ninguna reconciliación; revisa el lote actualizado.",
      floorCommitUnknown:
        "LPMS no pudo confirmar el resultado de la reconciliación. Actualiza y verifica la etapa registrada del lote antes de volver a intentarlo.",
      actionUnknown:
        "El Procesador no pudo confirmar el resultado. Se actualizó el tablero; verifica el estado actual del piso antes de volver a intentarlo.",
      unauthorized:
        "Tu sesión venció. Inicia sesión de nuevo antes de continuar.",
      forbidden:
        "Tu cuenta no puede completar esta acción de producción. Pide acceso a un propietario o administrador.",
      unavailable:
        "El tablero de producción no puede comunicarse con el servicio. Revisa tu conexión y actualiza.",
      invalidResponse:
        "El servicio de producción devolvió datos del tablero que el Procesador no pudo leer. Actualiza antes de continuar.",
    },
  },
  floorProgress: {
    title: "Registrar progreso del piso",
    description:
      "Úsalo cuando el tablero esté atrasado respecto a lo que ocurrió físicamente. Los tiempos planificados no cambian y los eventos omitidos quedan sin hora registrada.",
    batch: "Lote",
    batchOption: "Lote {{number}} · {{weight, number}} lb",
    currentRecord: "Registro actual",
    currentFloorState: "Estado actual del piso",
    alreadyFinished: "Este lote ya está registrado como terminado.",
    reviewChange: "Revisar el cambio registrado",
    finishedConsequences: "Consecuencias de terminar",
    machines: "Máquinas de {{stage}}",
    machineHelp:
      "Selecciona las máquinas que este lote usa ahora. El uso histórico de máquinas queda sin registrar.",
    noMachines: "No hay máquinas activas compatibles",
    noMachinesDescription:
      "Agrega o activa una máquina compatible antes de registrar esta etapa como activa.",
    whyBehind: "¿Por qué está atrasado el tablero?",
    note: "Nota",
    optional: "opcional",
    notePlaceholder: "Cualquier dato que deba saber el siguiente operador",
    otherNoteRequired: "Agrega una nota breve cuando el motivo sea Otra cosa.",
    ready: "Listo para registrar",
    readyDescription:
      "El servidor volvió a verificar la cola v{{queue}}, el lote {{batch}} y las versiones de las cuatro etapas. Confirma para convertirlo en el registro del piso.",
    failed: "Revisa el progreso registrado",
    keepCurrent: "Mantener registro actual",
    changeDetails: "Cambiar detalles",
    review: "Revisar progreso",
    confirm: "Confirmar y registrar",
    lpmsUnavailable: "LPMS no estaba disponible",
    updatesMissed: "Se omitieron actualizaciones",
    somethingElse: "Otra cosa",
    waitingToSort: "Esperando clasificación",
    sorting: "Clasificación",
    waitingToWash: "Esperando lavado",
    washing: "Lavado",
    waitingToDry: "Esperando secado",
    drying: "Secado",
    waitingToFold: "Esperando doblado y empaque",
    foldingPackaging: "Doblado y empaque",
    finished: "Terminado",
    noChanges: "No se registrarán cambios de etapa.",
    markOne: "Esto marcará: {{first}}.",
    markTwo: "Esto marcará: {{first}} y luego {{second}}.",
    markMany: "Esto marcará: {{earlier}} y luego {{last}}.",
    stageStarted: "{{stage}} iniciada",
    stageCompleted: "{{stage}} completada",
    finishConsequences: "Esto termina {{orders}} y {{bags}}.",
    closeRun:
      "Como este es el último lote sin terminar, la corrida de producción y el turno se cerrarán.",
  },
} as const
