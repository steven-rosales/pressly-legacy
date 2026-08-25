import type { ReactNode } from "react"

export function WorkspaceSectionHeading({
  title,
  titleId,
  description,
  action,
}: {
  title: string
  titleId?: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
