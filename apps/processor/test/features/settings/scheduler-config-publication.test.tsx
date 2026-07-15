import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SchedulerConfigPublication } from "@/features/settings/scheduler-config-publication.view"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import {
  makeTestProductionPort,
  testConfig,
  testIdempotency,
  testLocation,
} from "../../fixtures/production.fixture"

describe("scheduler configuration publication", () => {
  it("publishes explicit floor-fit facts from the dedicated configuration flow", async () => {
    const user = userEvent.setup()
    const publishConfig = vi.fn(async () => testConfig)
    const onPublished = vi.fn(async () => undefined)
    render(
      <SchedulerConfigPublication
        production={makeTestProductionPort({ publishConfig })}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        currentConfig={null}
        canManage
        onPublished={onPublished}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Publish configuration" })
    )
    expect(
      screen.getByRole("dialog", {
        name: "Publish production configuration",
      })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Pulse duration")).toHaveValue(56)
    expect(screen.getByLabelText("Fold rate")).toHaveValue(2)

    const publish = screen.getByRole("button", {
      name: "Publish immutable version",
    })
    expect(publish).toBeDisabled()
    expect(
      screen.getByText(
        "3 confirmations remaining before this version can be published."
      )
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("checkbox", { name: /sorting finishes/i })
    )
    expect(
      screen.getByText(
        "2 confirmations remaining before this version can be published."
      )
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("checkbox", { name: /washing finishes/i })
    )
    expect(
      screen.getByText(
        "1 confirmation remaining before this version can be published."
      )
    ).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: /drying finishes/i }))
    expect(
      screen.getByText("All three stage confirmations are complete.")
    ).toBeInTheDocument()
    await user.click(publish)

    expect(publishConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: testLocation.id,
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
      })
    )
    expect(onPublished).toHaveBeenCalledWith(testConfig)
    expect(
      screen.queryByRole("dialog", {
        name: "Publish production configuration",
      })
    ).not.toBeInTheDocument()
  })

  it("keeps publication owner/admin-only", () => {
    render(
      <SchedulerConfigPublication
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        currentConfig={testConfig}
        canManage={false}
        onPublished={vi.fn(async () => undefined)}
      />
    )

    const trigger = screen.getByRole("button", {
      name: "Publish new version",
    })
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveClass("justify-self-start")
  })

  it("explains invalid pulse inputs inline and exposes them to assistive technology", async () => {
    const user = userEvent.setup()
    render(
      <SchedulerConfigPublication
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        currentConfig={null}
        canManage
        onPublished={vi.fn(async () => undefined)}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Publish configuration" })
    )
    const pulse = screen.getByLabelText("Pulse duration")
    const foldRate = screen.getByLabelText("Fold rate")
    await user.clear(pulse)
    await user.clear(foldRate)

    expect(pulse).toHaveAttribute("aria-invalid", "true")
    expect(foldRate).toHaveAttribute("aria-invalid", "true")
    expect(
      screen.getByText("Enter a pulse duration of at least 1 minute.")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Enter a fold rate greater than 0.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Publish immutable version" })
    ).toBeDisabled()
  })

  it("freezes the entire publication form while the immutable version is being created", async () => {
    const user = userEvent.setup()
    let resolvePublish: (config: typeof testConfig) => void = () => undefined
    const publishConfig = vi.fn<ProductionPort["publishConfig"]>(
      () =>
        new Promise((resolve) => {
          resolvePublish = resolve
        })
    )
    render(
      <SchedulerConfigPublication
        production={makeTestProductionPort({ publishConfig })}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        currentConfig={null}
        canManage
        onPublished={vi.fn(async () => undefined)}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Publish configuration" })
    )
    const checkboxes = screen.getAllByRole("checkbox")
    for (const checkbox of checkboxes) await user.click(checkbox)
    await user.click(
      screen.getByRole("button", { name: "Publish immutable version" })
    )

    await waitFor(() => expect(publishConfig).toHaveBeenCalledOnce())
    const dialog = screen.getByRole("dialog", {
      name: "Publish production configuration",
    })
    expect(dialog).toHaveAttribute("aria-busy", "true")
    expect(screen.getByLabelText("Pulse duration")).toBeDisabled()
    expect(screen.getByLabelText("Fold rate")).toBeDisabled()
    for (const checkbox of checkboxes) expect(checkbox).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Publishing…" })).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "Close" })
    ).not.toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(dialog).toBeInTheDocument()

    await act(async () => resolvePublish(testConfig))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Publish production configuration",
        })
      ).not.toBeInTheDocument()
    )
  })

  it("binds an intentional publication to the config it supersedes", async () => {
    const user = userEvent.setup()
    const publishConfig = vi.fn<ProductionPort["publishConfig"]>(
      async () => testConfig
    )
    const key = vi.fn<IdempotencyPort["key"]>(async ({ payload }) => {
      const command = payload as Record<string, unknown>
      return "test:key:" + String(command.supersedesSchedulerConfigId)
    })
    const idempotency: IdempotencyPort = {
      key,
    }
    const firstCurrent = {
      ...testConfig,
      id: "00000000-0000-4000-8000-000000000060",
      pulseMinutes: 60,
    }
    const secondCurrent = {
      ...testConfig,
      id: "00000000-0000-4000-8000-000000000061",
      pulseMinutes: 70,
    }
    const props = {
      production: makeTestProductionPort({ publishConfig }),
      idempotency,
      locationId: testLocation.id,
      canManage: true,
      onPublished: vi.fn(async () => undefined),
    }
    const { rerender } = render(
      <SchedulerConfigPublication {...props} currentConfig={firstCurrent} />
    )

    const publishFiftyMinutePulse = async () => {
      await user.click(
        screen.getByRole("button", { name: "Publish new version" })
      )
      const pulse = screen.getByLabelText("Pulse duration")
      await user.clear(pulse)
      await user.type(pulse, "50")
      await user.click(
        screen.getByRole("checkbox", { name: /sorting finishes/i })
      )
      await user.click(
        screen.getByRole("checkbox", { name: /washing finishes/i })
      )
      await user.click(
        screen.getByRole("checkbox", { name: /drying finishes/i })
      )
      await user.click(
        screen.getByRole("button", { name: "Publish immutable version" })
      )
    }

    await publishFiftyMinutePulse()
    rerender(
      <SchedulerConfigPublication {...props} currentConfig={secondCurrent} />
    )
    await publishFiftyMinutePulse()

    expect(publishConfig).toHaveBeenCalledTimes(2)
    expect(
      publishConfig.mock.calls.map(([command]) => command.idempotencyKey)
    ).toEqual(["test:key:" + firstCurrent.id, "test:key:" + secondCurrent.id])
  })
})
