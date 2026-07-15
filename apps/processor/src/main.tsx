import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "@/app/app"
import { makeProcessorRuntime } from "@/app/app.composition"
import { ProcessorErrorBoundary } from "@/app/processor-error-boundary"
import { initializeProcessorObservability } from "@/app/processor-observability"
import { ThemeProvider } from "@/app/providers"

initializeProcessorObservability({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
  release: import.meta.env.VITE_SENTRY_RELEASE,
  tracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
})

const runtime = makeProcessorRuntime({
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "/api",
  storage: window.localStorage,
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <ProcessorErrorBoundary>
        <App runtime={runtime} />
      </ProcessorErrorBoundary>
    </ThemeProvider>
  </StrictMode>
)
