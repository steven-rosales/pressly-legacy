import * as React from "react"
import { useProcessorBrowserCapabilities } from "../../browser-capabilities.tsx"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

export function useIsMobile() {
  const browser = useProcessorBrowserCapabilities()
  const subscribe = React.useCallback(
    (onStoreChange: () => void) =>
      browser.viewport.subscribe(MOBILE_QUERY, onStoreChange),
    [browser.viewport]
  )
  const getSnapshot = React.useCallback(
    () => browser.viewport.matches(MOBILE_QUERY) ?? false,
    [browser.viewport]
  )
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
