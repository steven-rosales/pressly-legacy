export const englishAppMessages = {
  common: {
    appName: "Pressly Processor",
    loading: "Loading",
    retry: "Retry",
    refresh: "Refresh",
    cancel: "Cancel",
    close: "Close",
    confirm: "Confirm",
    continue: "Continue",
    save: "Save",
    back: "Back",
    next: "Next",
    previous: "Previous",
    search: "Search",
    all: "All",
    none: "None",
    notAvailable: "Not available",
    pounds: "{{value, number}} lb",
    bags_one: "{{count}} bag",
    bags_other: "{{count}} bags",
    orders_one: "{{count}} order",
    orders_other: "{{count}} orders",
    batches_one: "{{count}} batch",
    batches_other: "{{count}} batches",
    minutes_one: "{{count}} minute",
    minutes_other: "{{count}} minutes",
    minutesUnit: "minutes",
    minutesShort: "{{minutes}} min",
    queued: "Queued",
    stage: {
      sorting: "Sorting",
      washing: "Washing",
      drying: "Drying",
      foldingPackaging: "Folding & packaging",
    },
    employees_one: "{{count}} employee",
    employees_other: "{{count}} employees",
  },
  navigation: {
    label: "Processor",
    open: "Open navigation",
    dialogTitle: "Processor navigation",
    dialogDescription: "Choose a Processor workspace for this location.",
    home: "Home",
    production: "Production",
    schedule: "Schedule",
    history: "History",
    configuration: "Configuration",
    homeDescription:
      "Find orders, resolve floor exceptions, and keep whole-order production moving.",
    productionDescription: "Advance started work from sorting through folding.",
    scheduleDescription:
      "Plan whole orders through one fixed production pulse.",
    historyDescription:
      "Review production runs, floor activity, and schedule-plan lineage.",
    configurationDescription:
      "Manage language, appearance, and immutable scheduler inputs.",
    laundryProduction: "Laundry Production",
    locationAndTimezone: "{{location}} · {{timezone}}",
    signedInAs: "Signed in as {{name}}",
    signOut: "Sign out",
  },
  connection: {
    offline: "Offline",
    live: "Live",
    reconnecting: "Reconnecting",
    connecting: "Connecting",
    offlineTitle: "You are offline",
    offlineDescription:
      "Current data remains visible, but server actions will not complete until the connection returns.",
  },
  workspace: {
    loading: "Loading production workspace",
    attentionTitle: "Workspace needs attention",
    unavailableTitle: "No production workspace is available",
    unavailableDescription:
      "Refresh after the location has been configured on the server.",
    noActiveRun: "No active production run",
    ambiguousRun:
      "Pending orders need an explicit run selection because multiple production runs are active.",
    startSchedule:
      "Start an accepted schedule before opening the production floor.",
    openCandidate: "Open {{reason}}",
    openScheduling: "Open scheduling",
    pageNotFound: "Page not found",
    pageNotFoundDescription:
      "This address is not part of the production workspace.",
    openHome: "Open Processor home",
    candidateReason: {
      startedRun: "started run",
      acceptedPlan: "accepted plan",
      openShift: "open shift",
    },
  },
  errors: {
    loadProduction:
      "Current production data could not be loaded. Refresh before making floor decisions.",
    loadLocations:
      "Production locations could not be loaded. Check your connection and refresh.",
    unauthorized: "Your session is no longer valid. Sign in again.",
    forbidden: "You do not have permission to complete this action.",
    conflict:
      "The production record changed. Refresh and review it before trying again.",
    unavailable:
      "The production service is temporarily unavailable. Try again shortly.",
    invalidResponse:
      "The production service returned data the Processor could not read.",
    unexpected:
      "Processor could not confirm the current production state. Refresh before trying again.",
    locationNotFound:
      "This production location no longer exists. Choose another location.",
    locationUnavailable:
      "This production location is not available. Choose another location or ask an administrator to restore it.",
    workspaceNotFound:
      "This production run is no longer available. Return to Schedule or History and open a current record.",
  },
  errorBoundary: {
    title: "Processor needs to reload",
    description:
      "Your last action may not have completed. Reload, then confirm the floor state before trying it again.",
    reload: "Reload Processor",
  },
} as const

export const spanishAppMessages = {
  common: {
    appName: "Procesador Pressly",
    loading: "Cargando",
    retry: "Reintentar",
    refresh: "Actualizar",
    cancel: "Cancelar",
    close: "Cerrar",
    confirm: "Confirmar",
    continue: "Continuar",
    save: "Guardar",
    back: "Atrás",
    next: "Siguiente",
    previous: "Anterior",
    search: "Buscar",
    all: "Todos",
    none: "Ninguno",
    notAvailable: "No disponible",
    pounds: "{{value, number}} lb",
    bags_one: "{{count}} bolsa",
    bags_other: "{{count}} bolsas",
    orders_one: "{{count}} pedido",
    orders_other: "{{count}} pedidos",
    batches_one: "{{count}} lote",
    batches_other: "{{count}} lotes",
    minutes_one: "{{count}} minuto",
    minutes_other: "{{count}} minutos",
    minutesUnit: "minutos",
    minutesShort: "{{minutes}} min",
    queued: "En cola",
    stage: {
      sorting: "Clasificación",
      washing: "Lavado",
      drying: "Secado",
      foldingPackaging: "Doblado y empaque",
    },
    employees_one: "{{count}} empleado",
    employees_other: "{{count}} empleados",
  },
  navigation: {
    label: "Procesador",
    open: "Abrir navegación",
    dialogTitle: "Navegación del Procesador",
    dialogDescription:
      "Elige un espacio de trabajo del Procesador para esta ubicación.",
    home: "Inicio",
    production: "Producción",
    schedule: "Planificación",
    history: "Historial",
    configuration: "Configuración",
    homeDescription:
      "Busca pedidos, resuelve excepciones del piso y mantén en movimiento la producción de pedidos completos.",
    productionDescription:
      "Avanza el trabajo iniciado desde la clasificación hasta el doblado.",
    scheduleDescription:
      "Planifica pedidos completos mediante un pulso fijo de producción.",
    historyDescription:
      "Revisa las corridas de producción, la actividad del piso y el historial de los planes.",
    configurationDescription:
      "Administra el idioma, la apariencia y los parámetros inmutables del planificador.",
    laundryProduction: "Producción de lavandería",
    locationAndTimezone: "{{location}} · {{timezone}}",
    signedInAs: "Sesión iniciada como {{name}}",
    signOut: "Cerrar sesión",
  },
  connection: {
    offline: "Sin conexión",
    live: "En vivo",
    reconnecting: "Reconectando",
    connecting: "Conectando",
    offlineTitle: "Estás sin conexión",
    offlineDescription:
      "Los datos actuales siguen visibles, pero las acciones del servidor no se completarán hasta que vuelva la conexión.",
  },
  workspace: {
    loading: "Cargando el espacio de producción",
    attentionTitle: "El espacio de trabajo requiere atención",
    unavailableTitle: "No hay un espacio de producción disponible",
    unavailableDescription:
      "Actualiza después de configurar la ubicación en el servidor.",
    noActiveRun: "No hay una corrida de producción activa",
    ambiguousRun:
      "Los pedidos pendientes necesitan una selección explícita porque hay varias corridas de producción activas.",
    startSchedule:
      "Inicia un plan aceptado antes de abrir el piso de producción.",
    openCandidate: "Abrir {{reason}}",
    openScheduling: "Abrir planificación",
    pageNotFound: "Página no encontrada",
    pageNotFoundDescription:
      "Esta dirección no forma parte del espacio de producción.",
    openHome: "Abrir el inicio del Procesador",
    candidateReason: {
      startedRun: "corrida iniciada",
      acceptedPlan: "plan aceptado",
      openShift: "turno abierto",
    },
  },
  errors: {
    loadProduction:
      "No se pudieron cargar los datos actuales de producción. Actualiza antes de tomar decisiones en el piso.",
    loadLocations:
      "No se pudieron cargar las ubicaciones de producción. Revisa tu conexión y actualiza.",
    unauthorized: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
    forbidden: "No tienes permiso para completar esta acción.",
    conflict:
      "El registro de producción cambió. Actualízalo y revísalo antes de volver a intentarlo.",
    unavailable:
      "El servicio de producción no está disponible temporalmente. Inténtalo de nuevo en breve.",
    invalidResponse:
      "El servicio de producción devolvió datos que el Procesador no pudo leer.",
    unexpected:
      "El Procesador no pudo confirmar el estado actual de producción. Actualiza antes de volver a intentarlo.",
    locationNotFound:
      "Esta ubicación de producción ya no existe. Elige otra ubicación.",
    locationUnavailable:
      "Esta ubicación de producción no está disponible. Elige otra ubicación o pide a un administrador que la restaure.",
    workspaceNotFound:
      "Esta corrida de producción ya no está disponible. Vuelve a Planificación o Historial y abre un registro actual.",
  },
  errorBoundary: {
    title: "El Procesador necesita recargarse",
    description:
      "Es posible que tu última acción no se haya completado. Recarga y confirma el estado del piso antes de volver a intentarlo.",
    reload: "Recargar el Procesador",
  },
} as const
