export const englishAuthenticationMessages = {
  authentication: {
    signInTitle: "Sign in to Processor",
    verifyTitle: "Verify your identity",
    signInDescription:
      "Use your Pressly operator account. Your session stays in a protected browser cookie.",
    verifyDescription:
      "Complete the server-held challenge to open the production workspace.",
    failed: "Sign-in needs attention",
    email: "Email",
    password: "Password",
    verificationMethod: "Verification method",
    authenticatorCode: "Authenticator code",
    recoveryCode: "Recovery code",
    sixDigitCode: "Six-digit code",
    invalidCode: "Enter a valid {{kind}} code.",
    sixDigit: "six-digit",
    recovery: "recovery",
    signIn: "Sign in",
    verifyAndContinue: "Verify and continue",
    backToSignIn: "Back to sign in",
    restoring: "Restoring session",
    sessionExpired: "Your session expired. Sign in again to continue.",
    accessNotAssigned: "Processor access is not assigned",
    accessNotAssignedDescription:
      "{{name}} is authenticated, but this workspace is limited to owners, administrators, and production operators.",
    signOutFailed: "Sign out failed",
    errors: {
      invalidCredentials: "The email or password is incorrect.",
      rateLimited:
        "Too many sign-in attempts were made. Wait a few minutes, then try again.",
      invalidMfaCode:
        "That verification code is incorrect. Enter the current code and try again.",
      expiredMfaChallenge:
        "This verification attempt expired. Return to sign in and start again.",
      unavailable:
        "Processor cannot reach the sign-in service. Check your connection and try again.",
      invalidResponse:
        "The sign-in service returned an unreadable response. Reload Processor before trying again.",
      forbidden: "This account is not allowed to open Processor.",
      loginFailed:
        "Processor could not sign you in. Check your details and connection, then try again.",
      verificationFailed:
        "Processor could not verify this code. Return to sign in if the challenge has expired.",
      restoreFailed:
        "Processor could not restore your session. Sign in again to continue.",
      logoutFailed:
        "Processor could not confirm that you were signed out. Check your connection and try again.",
    },
  },
} as const

export const spanishAuthenticationMessages = {
  authentication: {
    signInTitle: "Iniciar sesión en el Procesador",
    verifyTitle: "Verifica tu identidad",
    signInDescription:
      "Usa tu cuenta de operador de Pressly. Tu sesión permanece en una cookie protegida del navegador.",
    verifyDescription:
      "Completa la verificación protegida por el servidor para abrir el espacio de producción.",
    failed: "El inicio de sesión requiere atención",
    email: "Correo electrónico",
    password: "Contraseña",
    verificationMethod: "Método de verificación",
    authenticatorCode: "Código del autenticador",
    recoveryCode: "Código de recuperación",
    sixDigitCode: "Código de seis dígitos",
    invalidCode: "Ingresa un código {{kind}} válido.",
    sixDigit: "de seis dígitos",
    recovery: "de recuperación",
    signIn: "Iniciar sesión",
    verifyAndContinue: "Verificar y continuar",
    backToSignIn: "Volver al inicio de sesión",
    restoring: "Restaurando sesión",
    sessionExpired: "Tu sesión venció. Inicia sesión de nuevo para continuar.",
    accessNotAssigned: "El acceso al Procesador no está asignado",
    accessNotAssignedDescription:
      "{{name}} está autenticado, pero este espacio está limitado a propietarios, administradores y operadores de producción.",
    signOutFailed: "No se pudo cerrar la sesión",
    errors: {
      invalidCredentials:
        "El correo electrónico o la contraseña son incorrectos.",
      rateLimited:
        "Se hicieron demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.",
      invalidMfaCode:
        "Ese código de verificación es incorrecto. Ingresa el código actual y vuelve a intentarlo.",
      expiredMfaChallenge:
        "Este intento de verificación venció. Vuelve al inicio de sesión y comienza de nuevo.",
      unavailable:
        "El Procesador no puede comunicarse con el servicio de inicio de sesión. Revisa tu conexión y vuelve a intentarlo.",
      invalidResponse:
        "El servicio de inicio de sesión devolvió una respuesta ilegible. Recarga el Procesador antes de volver a intentarlo.",
      forbidden: "Esta cuenta no tiene permiso para abrir el Procesador.",
      loginFailed:
        "El Procesador no pudo iniciar tu sesión. Revisa tus datos y conexión, y vuelve a intentarlo.",
      verificationFailed:
        "El Procesador no pudo verificar este código. Vuelve al inicio de sesión si el intento venció.",
      restoreFailed:
        "El Procesador no pudo restaurar tu sesión. Inicia sesión de nuevo para continuar.",
      logoutFailed:
        "El Procesador no pudo confirmar que se cerró tu sesión. Revisa tu conexión y vuelve a intentarlo.",
    },
  },
} as const
