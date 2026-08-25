import { render, screen } from "@testing-library/react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { processorLocationSelectionFeature } from "./feature.ts"
import userEvent from "@testing-library/user-event"
import { expect, vi } from "vitest"
import { ProductionLocationSelect } from "./location-selection.view.tsx"

proveExperienceFeature({
  featureId: "processor.location-selection",
  feature: processorLocationSelectionFeature,
  scenarios: [
    {
      name: "reports the location deliberately selected by the operator",
      proves: ["presentation-state", "component-interaction"],
      run: async () => {
        const user = userEvent.setup()
        const onValueChange = vi.fn()

        render(
          <ProductionLocationSelect
            locations={[
              {
                id: "location-north",
                name: "North Facility",
                timezone: "America/New_York",
                isActive: true,
              },
            ]}
            value={null}
            disabled={false}
            triggerId="location-choice"
            onValueChange={onValueChange}
          />
        )

        await user.click(
          screen.getByRole("combobox", { name: /production location/i })
        )
        await user.click(screen.getByRole("option", { name: "North Facility" }))

        expect(onValueChange).toHaveBeenCalledWith("location-north")
      },
    },
  ],
})
