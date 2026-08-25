import { cn } from "./class-names"
import { IconLoader } from "@tabler/icons-react"
import type { ComponentProps } from "react"

function Spinner({ className, ...props }: ComponentProps<typeof IconLoader>) {
  return (
    <IconLoader
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
