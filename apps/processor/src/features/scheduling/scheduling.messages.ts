export const englishSchedulingMessages = {
  scheduleHistory: {
    runningTitle: "Production is already running",
    runningDescription:
      "This shift already owns a production run. Continue floor work from the production board.",
    inProduction: "In production",
    completeTitle: "This shift is complete",
    completeDescription:
      "Its accepted plan and production record are preserved. Start the waiting orders in a new shift.",
    completed: "Completed",
    closedTitle: "This shift is closed",
    closedDescription:
      "Closed shifts are read-only. Plan a new shift for the waiting orders.",
    closed: "Closed",
    endedTitle: "This shift has ended",
    endedDescription:
      "It can no longer be computed, accepted, or started. Plan a new shift for the waiting orders.",
    ended: "Ended",
    openHistory: "Open production history",
    openProduction: "Open production",
    planNewShift: "Plan a new shift",
  },
  scheduling: {
    plannedDemand: "Planned demand",
    readyDemand: "Ready demand",
    previousPlanDemand: "Previous plan demand",
    wholeOrders_one: "{{count}} whole order",
    wholeOrders_other: "{{count}} whole orders",
    machines_one: "{{count}} machine",
    machines_other: "{{count}} machines",
    pulseCapacity: "Pulse capacity",
    recomputeCapacity: "Recompute to refresh capacity",
    productionPulse: "{{minutes}}-minute production pulse",
    makespan: "Makespan",
    recomputeTimeline: "Recompute to refresh timeline",
    sortingThroughPackaging: "Sorting through packaging",
    forecastFinish: "Forecast finish",
    recomputeForecast: "Recompute to refresh forecast",
    awaitingProposal: "Awaiting proposal",
    afterShift: "{{minutes}} min after shift",
    withinShift: "Within the shift window",
    computing: "Computing…",
    accepting: "Accepting…",
    starting: "Starting…",
    actionFailed: "Review this schedule action",
    managerRequired: "An owner or administrator must advance this plan.",
    blockingWarnings: "Blocking schedule warnings",
    warningShiftOverflowTitle: "Production extends past the shift",
    warningShiftOverflowDetail:
      "The projected finish is after the shift ends. Confirm this warning before accepting the plan, or edit the shift and recompute.",
    warningOversizedTitle: "Whole orders exceed pulse capacity",
    warningOversizedDetail_one:
      "{{count}} whole order exceeds the current pulse capacity and is not included in the proposed batches. Correct intake if its weight is wrong, or increase tested capacity and recompute.",
    warningOversizedDetail_other:
      "{{count}} whole orders exceed the current pulse capacity and are not included in the proposed batches. Correct intake if a weight is wrong, or increase tested capacity and recompute.",
    warningNoWashersTitle: "No active washer capacity",
    warningNoWashersDetail:
      "No active washer can carry production. Add or activate compatible washer capacity in Configuration, then recompute the plan.",
    warningNoDryersTitle: "No active dryer capacity",
    warningNoDryersDetail:
      "No active dryer can carry production. Add or activate compatible dryer capacity in Configuration, then recompute the plan.",
    warningNoFoldingTitle: "No folding capacity",
    warningNoFoldingDetail:
      "The folding team provides no capacity for this shift. Set a positive folding-team count, then recompute the plan.",
    warningsAcknowledged: "Warnings acknowledged with the accepted plan.",
    acknowledgeWarnings:
      "I acknowledge the blocking schedule warnings shown above.",
    summary: "Schedule summary",
    previousTimeline: "Previous production timeline",
    timelineTitle: "Production timeline",
    timelineDescription:
      "Whole orders stay together through four equal {{minutes}}-minute stages.",
    timeline: "Timeline",
    orders: "Orders",
    noPlan: "No plan computed",
    noPlanDescription:
      "Compute the schedule above to build the production timeline.",
    noEligibleWork: "No eligible work",
    noBatches: "This proposal has no production batches.",
    batch: "Batch",
    batchDetail: "{{weight, number}} lb · {{bags}}",
    teamStation: "Team station",
    noEligibleOrders: "No currently eligible orders",
    demandRemains: "Planned demand remains visible in the timeline above.",
    order: "Order {{orderId}}",
    orderDetail: "{{weight, number}} lb · {{bags}} · due {{due}}",
    priority: "Priority",
    prioritizeOrder: "Prioritize order {{orderId}}",
    setupRequired: "Setup required",
    publishConfiguration: "Publish a production configuration",
    configurationDescription:
      "Scheduling uses the floor-tested pulse published in Configuration.",
    openConfiguration: "Open configuration",
    changesNotComputed: "Changes not computed",
    recomputePlan: "Recompute the plan",
    recomputeDescription:
      "Shift settings, order priority, or ready demand changed after this plan was computed.",
    recomputeSchedule: "Recompute schedule",
    planAccepted: "Plan accepted",
    readyToStart: "Ready to start production",
    startDescription:
      "Starting creates the production run after one final server check.",
    startRun: "Start production run",
    reviewPlan: "Review plan",
    acceptExactProposal: "Accept this exact proposal",
    acceptDescription:
      "Review the timeline and warnings, then save this plan as the shift preference.",
    acceptPlan: "Accept plan",
    readyToCompute: "Ready to compute",
    buildShiftPlan: "Build the shift plan",
    buildDescription: "Compute one proposal from every eligible order.",
    computeSchedule: "Compute schedule",
    publishBeforeComputing:
      "Publish a production configuration before computing.",
    positiveFolders: "Enter a positive folder count before computing.",
    endAfterStart: "Shift end must be after shift start.",
    errors: {
      shiftChanged:
        "Shift settings changed after this page loaded. The latest shift has been loaded; review it before continuing.",
      shiftStarted:
        "This shift has already started and its time window can no longer be edited.",
      shiftClosed:
        "This shift is closed. Create a new shift for the waiting orders.",
      shiftEnded:
        "This shift has ended. Create a new shift before computing or starting production.",
      shiftNotStarted:
        "Production cannot start before the shift begins. Wait until the shift start time or edit the shift.",
      shiftWindowInvalid:
        "The server rejected this shift window. Confirm the local date, start time, end time, and timezone.",
      configurationInvalid:
        "The published production configuration is no longer valid. Open Configuration and publish a tested pulse.",
      planStale:
        "This plan is no longer current. Recompute it, then review the new timeline before continuing.",
      demandChanged:
        "Ready orders or shift settings changed after this plan was computed. Recompute the schedule before continuing.",
      acceptBeforeStart: "Accept the current plan before starting production.",
      warningsRequired:
        "Acknowledge every blocking warning shown in this plan before accepting it.",
      warningsChanged:
        "The blocking warnings changed. Recompute and review the current warnings before accepting.",
      noBatches:
        "This plan has no production batches. Make at least one order eligible, then recompute before starting.",
      productionAlreadyStarted:
        "Production has already started for this shift. Open Production to continue floor work.",
      priorityChanged:
        "This order changed before its priority was saved. The current order list has been loaded; review it and try again.",
      notFound:
        "This shift or plan no longer exists. Refresh Schedule and create a current plan.",
      unauthorized: "Your session expired. Sign in again before continuing.",
      forbidden:
        "Your account cannot change this schedule. Ask an owner or administrator to complete the action.",
      unavailable:
        "Schedule cannot reach the production service. Check your connection and try again.",
      invalidResponse:
        "The production service returned schedule data that Processor could not read. Refresh before continuing.",
      computeFailed:
        "The schedule was not computed. Review the shift window, eligible orders, and published configuration before trying again.",
      priorityFailed:
        "Processor could not confirm the priority change. Refresh the order list before trying again.",
      acceptFailed:
        "The plan was not accepted. Recompute if production inputs changed, then review and accept the current plan.",
      startUnknown:
        "Processor could not confirm whether production started. Refresh and check Production before trying again.",
    },
  },
  shiftSettings: {
    setShift: "Set shift",
    editShift: "Edit shift",
    title: "Shift settings",
    createDescription:
      "Set the next shift without changing the tested production pulse.",
    editDescription:
      "Adjust this shift without changing the tested production pulse.",
    publishedPulse: "Published pulse",
    managedInConfiguration: "Floor capability is managed in Configuration.",
    pulse: "Pulse",
    foldRate: "Fold rate",
    publishedReadOnly: "Published values are read-only during scheduling.",
    foldingTeam: "Folding team",
    people: "people",
    foldingTeamHelp: "Effective people available for folding and packaging.",
    foldingTeamInvalid: "Enter at least one person for the folding team.",
    createFailed: "Review the new shift",
    saveFailed: "Review the shift changes",
    creating: "Creating…",
    saving: "Saving…",
    createAndCompute: "Create & compute",
    saveAndRecompute: "Save & recompute",
  },
  shiftWindow: {
    title: "Shift window",
    date: "Date",
    nextDay: "next day",
    nextDayBadge: "Next day",
    chooseDate: "choose a date",
    ariaLabel:
      "Shift window: {{date}}, {{start}} to {{end}}{{nextDay}}. Local time in {{timezone}}.",
    chooseDateAndTimes: "Choose shift date and times",
    description:
      "Choose the working date, then set the floor start and end times.",
    startTime: "Start time",
    endTime: "End time",
    localTime: "Local time · {{timezone}}",
    overnight: "Overnight shift",
    sameDay: "Same-day shift",
    incomplete: "Choose a complete shift date and times.",
    equalTimes:
      "Start and end time must be different; equal times would create a 24-hour shift.",
  },
} as const

export const spanishSchedulingMessages = {
  scheduleHistory: {
    runningTitle: "La producción ya está en curso",
    runningDescription:
      "Este turno ya tiene una corrida de producción. Continúa el trabajo desde el tablero de producción.",
    inProduction: "En producción",
    completeTitle: "Este turno está completo",
    completeDescription:
      "Su plan aceptado y registro de producción se conservan. Inicia los pedidos en espera en un turno nuevo.",
    completed: "Completado",
    closedTitle: "Este turno está cerrado",
    closedDescription:
      "Los turnos cerrados son de solo lectura. Planifica un turno nuevo para los pedidos en espera.",
    closed: "Cerrado",
    endedTitle: "Este turno terminó",
    endedDescription:
      "Ya no se puede calcular, aceptar ni iniciar. Planifica un turno nuevo para los pedidos en espera.",
    ended: "Terminado",
    openHistory: "Abrir historial de producción",
    openProduction: "Abrir producción",
    planNewShift: "Planificar un turno nuevo",
  },
  scheduling: {
    plannedDemand: "Demanda planificada",
    readyDemand: "Demanda lista",
    previousPlanDemand: "Demanda del plan anterior",
    wholeOrders_one: "{{count}} pedido completo",
    wholeOrders_other: "{{count}} pedidos completos",
    machines_one: "{{count}} máquina",
    machines_other: "{{count}} máquinas",
    pulseCapacity: "Capacidad del pulso",
    recomputeCapacity: "Vuelve a calcular para actualizar la capacidad",
    productionPulse: "Pulso de producción de {{minutes}} minutos",
    makespan: "Duración total",
    recomputeTimeline: "Vuelve a calcular para actualizar el cronograma",
    sortingThroughPackaging: "De clasificación a empaque",
    forecastFinish: "Fin previsto",
    recomputeForecast: "Vuelve a calcular para actualizar el pronóstico",
    awaitingProposal: "Esperando propuesta",
    afterShift: "{{minutes}} min después del turno",
    withinShift: "Dentro de la ventana del turno",
    computing: "Calculando…",
    accepting: "Aceptando…",
    starting: "Iniciando…",
    actionFailed: "Revisa esta acción de planificación",
    managerRequired: "Un propietario o administrador debe avanzar este plan.",
    blockingWarnings: "Advertencias que bloquean el plan",
    warningShiftOverflowTitle: "La producción sobrepasa el turno",
    warningShiftOverflowDetail:
      "La hora prevista de finalización es posterior al fin del turno. Confirma esta advertencia antes de aceptar el plan, o edita el turno y vuelve a calcular.",
    warningOversizedTitle: "Pedidos completos exceden la capacidad del pulso",
    warningOversizedDetail_one:
      "{{count}} pedido completo excede la capacidad actual del pulso y no está incluido en los lotes propuestos. Corrige la recepción si el peso es incorrecto, o aumenta la capacidad probada y vuelve a calcular.",
    warningOversizedDetail_other:
      "{{count}} pedidos completos exceden la capacidad actual del pulso y no están incluidos en los lotes propuestos. Corrige la recepción si algún peso es incorrecto, o aumenta la capacidad probada y vuelve a calcular.",
    warningNoWashersTitle: "No hay capacidad activa de lavado",
    warningNoWashersDetail:
      "Ninguna lavadora activa puede procesar la producción. Agrega o activa capacidad de lavado compatible en Configuración y vuelve a calcular el plan.",
    warningNoDryersTitle: "No hay capacidad activa de secado",
    warningNoDryersDetail:
      "Ninguna secadora activa puede procesar la producción. Agrega o activa capacidad de secado compatible en Configuración y vuelve a calcular el plan.",
    warningNoFoldingTitle: "No hay capacidad de doblado",
    warningNoFoldingDetail:
      "El equipo de doblado no aporta capacidad para este turno. Define una cantidad positiva de personas y vuelve a calcular el plan.",
    warningsAcknowledged: "Advertencias confirmadas con el plan aceptado.",
    acknowledgeWarnings:
      "Confirmo las advertencias que bloquean el plan y aparecen arriba.",
    summary: "Resumen del plan",
    previousTimeline: "Cronograma de producción anterior",
    timelineTitle: "Cronograma de producción",
    timelineDescription:
      "Los pedidos completos permanecen juntos durante cuatro etapas iguales de {{minutes}} minutos.",
    timeline: "Cronograma",
    orders: "Pedidos",
    noPlan: "No se ha calculado un plan",
    noPlanDescription:
      "Calcula el plan arriba para crear el cronograma de producción.",
    noEligibleWork: "No hay trabajo elegible",
    noBatches: "Esta propuesta no tiene lotes de producción.",
    batch: "Lote",
    batchDetail: "{{weight, number}} lb · {{bags}}",
    teamStation: "Estación de equipo",
    noEligibleOrders: "No hay pedidos elegibles actualmente",
    demandRemains:
      "La demanda planificada sigue visible en el cronograma de arriba.",
    order: "Pedido {{orderId}}",
    orderDetail: "{{weight, number}} lb · {{bags}} · vence {{due}}",
    priority: "Prioridad",
    prioritizeOrder: "Priorizar pedido {{orderId}}",
    setupRequired: "Configuración requerida",
    publishConfiguration: "Publica una configuración de producción",
    configurationDescription:
      "La planificación usa el pulso probado en el piso y publicado en Configuración.",
    openConfiguration: "Abrir configuración",
    changesNotComputed: "Cambios sin calcular",
    recomputePlan: "Vuelve a calcular el plan",
    recomputeDescription:
      "La configuración del turno, la prioridad o la demanda lista cambió después de calcular este plan.",
    recomputeSchedule: "Volver a calcular el plan",
    planAccepted: "Plan aceptado",
    readyToStart: "Listo para iniciar producción",
    startDescription:
      "Al iniciar, se crea la corrida de producción después de una última verificación del servidor.",
    startRun: "Iniciar corrida de producción",
    reviewPlan: "Revisar plan",
    acceptExactProposal: "Acepta esta propuesta exacta",
    acceptDescription:
      "Revisa el cronograma y las advertencias; luego guarda este plan como preferencia del turno.",
    acceptPlan: "Aceptar plan",
    readyToCompute: "Listo para calcular",
    buildShiftPlan: "Crea el plan del turno",
    buildDescription: "Calcula una propuesta con cada pedido elegible.",
    computeSchedule: "Calcular plan",
    publishBeforeComputing:
      "Publica una configuración de producción antes de calcular.",
    positiveFolders:
      "Ingresa una cantidad positiva de personas para doblado antes de calcular.",
    endAfterStart: "El turno debe terminar después de comenzar.",
    errors: {
      shiftChanged:
        "La configuración del turno cambió después de cargar esta página. Se cargó el turno más reciente; revísalo antes de continuar.",
      shiftStarted: "Este turno ya comenzó y su horario ya no se puede editar.",
      shiftClosed:
        "Este turno está cerrado. Crea un turno nuevo para los pedidos en espera.",
      shiftEnded:
        "Este turno terminó. Crea un turno nuevo antes de calcular o iniciar la producción.",
      shiftNotStarted:
        "La producción no puede iniciar antes que el turno. Espera hasta la hora de inicio o edita el turno.",
      shiftWindowInvalid:
        "El servidor rechazó este horario. Confirma la fecha local, las horas de inicio y fin, y la zona horaria.",
      configurationInvalid:
        "La configuración de producción publicada ya no es válida. Abre Configuración y publica un pulso probado.",
      planStale:
        "Este plan ya no es el actual. Vuelve a calcularlo y revisa la nueva línea de tiempo antes de continuar.",
      demandChanged:
        "Los pedidos listos o la configuración del turno cambiaron después de calcular este plan. Vuelve a calcular antes de continuar.",
      acceptBeforeStart:
        "Acepta el plan actual antes de iniciar la producción.",
      warningsRequired:
        "Confirma todas las advertencias bloqueantes que aparecen en este plan antes de aceptarlo.",
      warningsChanged:
        "Las advertencias bloqueantes cambiaron. Vuelve a calcular y revisa las advertencias actuales antes de aceptar.",
      noBatches:
        "Este plan no tiene lotes de producción. Haz elegible al menos un pedido y vuelve a calcular antes de iniciar.",
      productionAlreadyStarted:
        "La producción ya comenzó para este turno. Abre Producción para continuar el trabajo del piso.",
      priorityChanged:
        "Este pedido cambió antes de guardar su prioridad. Se cargó la lista actual; revísala y vuelve a intentarlo.",
      notFound:
        "Este turno o plan ya no existe. Actualiza Planificación y crea un plan actual.",
      unauthorized:
        "Tu sesión venció. Inicia sesión de nuevo antes de continuar.",
      forbidden:
        "Tu cuenta no puede cambiar este plan. Pide a un propietario o administrador que complete la acción.",
      unavailable:
        "Planificación no puede comunicarse con el servicio de producción. Revisa tu conexión y vuelve a intentarlo.",
      invalidResponse:
        "El servicio de producción devolvió datos de planificación que el Procesador no pudo leer. Actualiza antes de continuar.",
      computeFailed:
        "No se calculó el plan. Revisa el horario, los pedidos elegibles y la configuración publicada antes de volver a intentarlo.",
      priorityFailed:
        "El Procesador no pudo confirmar el cambio de prioridad. Actualiza la lista de pedidos antes de volver a intentarlo.",
      acceptFailed:
        "No se aceptó el plan. Si cambiaron los datos de producción, vuelve a calcularlo; luego revisa y acepta el plan actual.",
      startUnknown:
        "El Procesador no pudo confirmar si la producción comenzó. Actualiza y revisa Producción antes de volver a intentarlo.",
    },
  },
  shiftSettings: {
    setShift: "Definir turno",
    editShift: "Editar turno",
    title: "Configuración del turno",
    createDescription:
      "Define el próximo turno sin cambiar el pulso de producción probado.",
    editDescription:
      "Ajusta este turno sin cambiar el pulso de producción probado.",
    publishedPulse: "Pulso publicado",
    managedInConfiguration:
      "La capacidad del piso se administra en Configuración.",
    pulse: "Pulso",
    foldRate: "Ritmo de doblado",
    publishedReadOnly:
      "Los valores publicados son de solo lectura durante la planificación.",
    foldingTeam: "Equipo de doblado",
    people: "personas",
    foldingTeamHelp: "Personas efectivas disponibles para doblado y empaque.",
    foldingTeamInvalid:
      "Ingresa al menos una persona para el equipo de doblado.",
    createFailed: "Revisa el turno nuevo",
    saveFailed: "Revisa los cambios del turno",
    creating: "Creando…",
    saving: "Guardando…",
    createAndCompute: "Crear y calcular",
    saveAndRecompute: "Guardar y recalcular",
  },
  shiftWindow: {
    title: "Ventana del turno",
    date: "Fecha",
    nextDay: "día siguiente",
    nextDayBadge: "Día siguiente",
    chooseDate: "elige una fecha",
    ariaLabel:
      "Ventana del turno: {{date}}, de {{start}} a {{end}}{{nextDay}}. Hora local en {{timezone}}.",
    chooseDateAndTimes: "Elegir fecha y horas del turno",
    description:
      "Elige la fecha de trabajo y luego define las horas de inicio y fin del piso.",
    startTime: "Hora de inicio",
    endTime: "Hora de fin",
    localTime: "Hora local · {{timezone}}",
    overnight: "Turno nocturno",
    sameDay: "Turno del mismo día",
    incomplete: "Elige una fecha y horas completas para el turno.",
    equalTimes:
      "Las horas de inicio y fin deben ser distintas; horas iguales crearían un turno de 24 horas.",
  },
} as const
