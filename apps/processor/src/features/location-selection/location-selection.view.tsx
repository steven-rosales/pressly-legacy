import type { ProductionLocation } from "@pressly/contracts"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
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
        aria-label={t("location.productionLocation")}
      >
        <SelectValue placeholder={t("location.choosePlaceholder")} />
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
