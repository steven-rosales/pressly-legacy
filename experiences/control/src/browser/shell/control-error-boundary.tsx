import { Component, type ErrorInfo, type ReactNode } from "react"

type ControlErrorBoundaryProps = Readonly<{
  children: ReactNode
  report: (error: Error, context: Readonly<{ componentStack: string }>) => void
  reload: () => void
}>

type ControlErrorBoundaryState = Readonly<{ failed: boolean }>

export class ControlErrorBoundary extends Component<
  ControlErrorBoundaryProps,
  ControlErrorBoundaryState
> {
  override state: ControlErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ControlErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      this.props.report(error, { componentStack: info.componentStack ?? "" })
    } catch {
      // Reporting cannot replace the recovery surface.
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return (
      <main className="bg-muted/30 grid min-h-screen place-items-center p-4">
        <section
          className="bg-background w-full max-w-lg space-y-4 rounded-xl border p-6 shadow-sm"
          role="alert"
        >
          <p className="text-sm font-semibold tracking-wide uppercase">
            Pressly Control
          </p>
          <h1 className="text-2xl font-semibold">Something went wrong.</h1>
          <p className="text-muted-foreground">
            Reload Control to restore a clean workspace. Your failed action was
            not confirmed as complete.
          </p>
          <button
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium"
            type="button"
            onClick={this.props.reload}
          >
            Reload Control
          </button>
        </section>
      </main>
    )
  }
}
