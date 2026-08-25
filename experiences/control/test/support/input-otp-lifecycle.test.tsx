import { useState } from "react"
import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "../../src/browser/components/ui/input-otp"

function ControlledInputOtp() {
  const [value, setValue] = useState("")

  return (
    <InputOTP maxLength={1} value={value} onChange={setValue}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
      </InputOTPGroup>
    </InputOTP>
  )
}

describe("InputOTP test lifecycle", () => {
  it("can unmount after a value change schedules deferred synchronization", () => {
    const view = render(<ControlledInputOtp />)
    const input = view.container.querySelector("[data-input-otp]")

    expect(input).not.toBeNull()
    fireEvent.change(input!, { target: { value: "1" } })
    expect(input).toHaveValue("1")
    view.unmount()
  })
})
