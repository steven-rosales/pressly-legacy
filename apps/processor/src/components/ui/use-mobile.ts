import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const getSnapshot = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false

  return window.matchMedia(MOBILE_QUERY).matches
}

const subscribe = (onStoreChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => undefined
  const mql = window.matchMedia(MOBILE_QUERY)

  mql.addEventListener("change", onStoreChange)

  return () => mql.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
