import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ControlErrorBoundary } from "@/app/control-error-boundary"

function BrokenView(): never {
  throw new Error("render failed")
}

describe("ControlErrorBoundary", () => {
  it("reports render failures once and shows an honest recovery surface", () => {
    const report = vi.fn()

    render(
      <ControlErrorBoundary report={report}>
        <BrokenView />
      </ControlErrorBoundary>,
    )

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ message: "render failed" }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your failed action was not confirmed as complete.",
    )
    expect(screen.getByRole("button", { name: "Reload Control" })).toBeVisible()
  })
})
