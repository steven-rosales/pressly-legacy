import { useEffect, useState } from "react"

import { cn } from "@/components/ui/class-names"
import { Skeleton } from "@/components/ui/skeleton"

function DelayedLoadingRows({
  label,
  count = 5,
  delayMs = 300,
}: Readonly<{
  label: string
  count?: number
  delayMs?: number
}>) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs])

  return (
    <div
      className={cn(
        "flex flex-col gap-2 transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0"
      )}
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  )
}

export { DelayedLoadingRows }
