import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "@/app/app"
import { makeProcessorRuntime } from "@/app/app.composition"
import { ThemeProvider } from "@/app/providers"

const runtime = makeProcessorRuntime({
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "/api",
  storage: window.localStorage,
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <App runtime={runtime} />
    </ThemeProvider>
  </StrictMode>
)
