import type { ProductionLocation } from "@pressly/contracts"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ProductionLocationSelect({
  locations,
  value,
  disabled,
  triggerId,
  className,
  onValueChange,
}: {
  locations: readonly ProductionLocation[]
  value: string | null
  disabled: boolean
  triggerId: string
  className?: string
  onValueChange: (locationId: string) => void
}) {
  return (
    <Select
      value={value ?? undefined}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={triggerId}
        size="sm"
        className={className}
        aria-label="Production location"
      >
        <SelectValue placeholder="Choose a location" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
