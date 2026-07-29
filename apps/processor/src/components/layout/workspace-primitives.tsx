import type { ReactNode } from "react"

export type MetricStripItem = Readonly<{
  label: string
  value: string
  detail: string
}>

export function MetricStrip({
  label,
  metrics,
}: Readonly<{
  label: string
  metrics: readonly MetricStripItem[]
}>) {
  return (
    <section aria-label={label} data-slot="metric-strip">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            data-slot="metric"
            className="min-w-0 bg-background p-4"
          >
            <dt className="text-sm text-muted-foreground">{metric.label}</dt>
            <dd>
              <p className="mt-2 text-2xl font-medium tracking-tight tabular-nums">
                {metric.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {metric.detail}
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function SectionHeading({
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
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
