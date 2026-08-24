import { render, screen } from "@testing-library/react"
import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import { ControlErrorBoundary } from "./control-error-boundary"

function BrokenView(): never {
  throw unexpectedError({
    code: "control_test_render_failed",
    message: "render failed",
  })
}

describe("ControlErrorBoundary", () => {
  it("reports render failures once and shows an honest recovery surface", () => {
    const report = vi.fn()

    render(
      <ControlErrorBoundary report={report} reload={vi.fn()}>
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
