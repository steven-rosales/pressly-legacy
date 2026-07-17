export const englishSettingsMessages = {
  language: {
    title: "Language",
    description: "Choose the language used by Processor on this browser.",
    preferenceSaved: "Your preference is saved automatically.",
    english: "English",
    spanish: "Español",
  },
  settings: {
    publishedPulse: "Published production pulse",
    notConfigured:
      "Production scheduling is not configured. Publish a tested pulse before computing a schedule.",
    immutableVersion: "Immutable scheduler configuration · version {{version}}",
    pulseSummary: "Production pulse summary",
    pulseDuration: "Pulse duration",
    notPublished: "Not published",
    foldingRate: "Folding rate",
    foldingRateValue: "{{value, number}} lb/min/person",
    foldingRateUnit: "lb/min/person",
    effectiveFolders: "Effective folders",
    noActiveShift: "No active shift",
    pulseCapacity: "Pulse capacity",
    capacityUnavailable: "Available with a published pulse and active shift",
    foldingCeiling: "{{value, number}} lb folding ceiling",
    appearance: "Appearance",
    appearanceDescription: "Choose how the processor looks on this browser.",
    colorMode: "Color mode",
    preferenceSaved: "Your preference is saved automatically.",
    light: "Light",
    dark: "Dark",
    publishConfiguration: "Publish configuration",
    publishNewVersion: "Publish new version",
    publishTitle: "Publish production configuration",
    publishDescription:
      "Record a tested pulse as a new immutable scheduler version.",
    publishFailed: "Review configuration publication",
    immutableTitle: "This creates an immutable version",
    immutableDescription:
      "Existing plans retain their original configuration. New schedule computations use the latest published version.",
    pulseHelp: "The single clock used by every production stage.",
    pulseInvalid: "Enter a pulse duration of at least 1 minute.",
    foldRate: "Fold rate",
    foldRateHelp: "Observed folding and packaging throughput per person.",
    foldRateInvalid: "Enter a fold rate greater than 0.",
    physicalStageFit: "Physical stage fit",
    physicalStageFitHelp:
      "Confirm observed floor capability for this exact pulse. Every stage must be confirmed before publication.",
    sorting: "Sorting",
    washing: "Washing",
    drying: "Drying",
    stageFits: "{{stage}} finishes within the full {{minutes}}-minute pulse.",
    configured: "configured",
    confirmationsComplete: "All three stage confirmations are complete.",
    confirmationsRemaining_one:
      "{{count}} confirmation remaining before this version can be published.",
    confirmationsRemaining_other:
      "{{count}} confirmations remaining before this version can be published.",
    publishing: "Publishing…",
    publishImmutable: "Publish immutable version",
    positiveValuesRequired:
      "Pulse duration and fold rate must both be positive.",
    stageFitRequired:
      "Confirm sorting, washing, and drying fit inside this exact pulse.",
    errors: {
      invalid:
        "The server rejected these values. Confirm the pulse, fold rate, and all three physical stage checks.",
      conflict:
        "A newer production configuration was published while this form was open. Close it, review the current version, and publish again if needed.",
      unauthorized:
        "Your session expired. Sign in again before publishing a configuration.",
      forbidden:
        "Your account cannot publish production configuration. Ask an owner or administrator to complete this action.",
      unavailable:
        "Configuration cannot reach the production service. Check your connection, then refresh before publishing again.",
      invalidResponse:
        "The production service returned configuration data that Processor could not read. Refresh before continuing.",
      publishUnknown:
        "Processor could not confirm whether this configuration was published. Refresh Configuration and check the current version before trying again.",
    },
  },
} as const

export const spanishSettingsMessages = {
  language: {
    title: "Idioma",
    description: "Elige el idioma que usa el Procesador en este navegador.",
    preferenceSaved: "Tu preferencia se guarda automáticamente.",
    english: "English",
    spanish: "Español",
  },
  settings: {
    publishedPulse: "Pulso de producción publicado",
    notConfigured:
      "La planificación de producción no está configurada. Publica un pulso probado antes de calcular un plan.",
    immutableVersion:
      "Configuración inmutable del planificador · versión {{version}}",
    pulseSummary: "Resumen del pulso de producción",
    pulseDuration: "Duración del pulso",
    notPublished: "No publicado",
    foldingRate: "Ritmo de doblado",
    foldingRateValue: "{{value, number}} lb/min/persona",
    foldingRateUnit: "lb/min/persona",
    effectiveFolders: "Personas efectivas en doblado",
    noActiveShift: "No hay un turno activo",
    pulseCapacity: "Capacidad del pulso",
    capacityUnavailable: "Disponible con un pulso publicado y un turno activo",
    foldingCeiling: "Límite de doblado de {{value, number}} lb",
    appearance: "Apariencia",
    appearanceDescription: "Elige cómo se ve el Procesador en este navegador.",
    colorMode: "Modo de color",
    preferenceSaved: "Tu preferencia se guarda automáticamente.",
    light: "Claro",
    dark: "Oscuro",
    publishConfiguration: "Publicar configuración",
    publishNewVersion: "Publicar una versión nueva",
    publishTitle: "Publicar configuración de producción",
    publishDescription:
      "Registra un pulso probado como una nueva versión inmutable del planificador.",
    publishFailed: "Revisa la publicación de la configuración",
    immutableTitle: "Esto crea una versión inmutable",
    immutableDescription:
      "Los planes existentes conservan su configuración original. Los nuevos cálculos usan la última versión publicada.",
    pulseHelp: "El reloj único que usan todas las etapas de producción.",
    pulseInvalid: "Ingresa una duración de pulso de al menos 1 minuto.",
    foldRate: "Ritmo de doblado",
    foldRateHelp: "Rendimiento observado de doblado y empaque por persona.",
    foldRateInvalid: "Ingresa un ritmo de doblado mayor que 0.",
    physicalStageFit: "Capacidad física por etapa",
    physicalStageFitHelp:
      "Confirma la capacidad observada del piso para este pulso exacto. Debes confirmar cada etapa antes de publicar.",
    sorting: "Clasificación",
    washing: "Lavado",
    drying: "Secado",
    stageFits:
      "{{stage}} termina dentro del pulso completo de {{minutes}} minutos.",
    configured: "configurado",
    confirmationsComplete: "Las tres confirmaciones de etapa están completas.",
    confirmationsRemaining_one:
      "Falta {{count}} confirmación para poder publicar esta versión.",
    confirmationsRemaining_other:
      "Faltan {{count}} confirmaciones para poder publicar esta versión.",
    publishing: "Publicando…",
    publishImmutable: "Publicar versión inmutable",
    positiveValuesRequired:
      "La duración del pulso y el ritmo de doblado deben ser positivos.",
    stageFitRequired:
      "Confirma que la clasificación, el lavado y el secado caben en este pulso exacto.",
    errors: {
      invalid:
        "El servidor rechazó estos valores. Confirma el pulso, el ritmo de doblado y las tres verificaciones físicas de etapa.",
      conflict:
        "Se publicó una configuración de producción más reciente mientras este formulario estaba abierto. Ciérralo, revisa la versión actual y publica otra vez si es necesario.",
      unauthorized:
        "Tu sesión venció. Inicia sesión de nuevo antes de publicar una configuración.",
      forbidden:
        "Tu cuenta no puede publicar la configuración de producción. Pide a un propietario o administrador que complete esta acción.",
      unavailable:
        "Configuración no puede comunicarse con el servicio de producción. Revisa tu conexión y actualiza antes de publicar otra vez.",
      invalidResponse:
        "El servicio de producción devolvió datos de configuración que el Procesador no pudo leer. Actualiza antes de continuar.",
      publishUnknown:
        "El Procesador no pudo confirmar si se publicó esta configuración. Actualiza Configuración y revisa la versión actual antes de volver a intentarlo.",
    },
  },
} as const
