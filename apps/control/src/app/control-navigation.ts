import {
  IconHome,
  IconPackage,
  IconSettings,
  IconShieldLock,
  IconUsers,
  IconUserSquareRounded,
} from "@tabler/icons-react"
import type {
  WorkspaceNavigationItem,
  WorkspaceNavigationSection,
} from "@/components/ui"

export type ControlView =
  | "home"
  | "orders"
  | "customers"
  | "team"
  | "security"
  | "configuration"

export const controlHomeNavigation: WorkspaceNavigationItem<ControlView> = {
  id: "home",
  label: "Home",
  icon: IconHome,
}

const navigationSections: readonly WorkspaceNavigationSection<ControlView>[] = [
  {
    id: "business",
    label: "Business",
    items: [
      { id: "orders", label: "Orders", icon: IconPackage },
      {
        id: "customers",
        label: "Customers",
        icon: IconUserSquareRounded,
      },
    ],
  },
  {
    id: "peopleAccess",
    label: "People & access",
    items: [
      { id: "team", label: "Team", icon: IconUsers },
      { id: "security", label: "Security", icon: IconShieldLock },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        id: "configuration",
        label: "Configuration",
        icon: IconSettings,
      },
    ],
  },
]

const requiredCapability: Readonly<
  Partial<Record<ControlView, readonly string[]>>
> = {
  orders: ["orders:read"],
  customers: ["customers:read"],
  team: ["team:read"],
  security: ["security:read", "auth:mfa:enroll"],
}

export function navigationForCapabilities(
  capabilities: readonly string[],
): readonly WorkspaceNavigationSection<ControlView>[] {
  const granted = new Set(capabilities)
  return navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const requirements = requiredCapability[item.id]
        return (
          requirements === undefined ||
          requirements.some((capability) => granted.has(capability))
        )
      }),
    }))
    .filter((section) => section.items.length > 0)
}

export function isControlView(value: string): value is ControlView {
  return [
    "home",
    "orders",
    "customers",
    "team",
    "security",
    "configuration",
  ].includes(value)
}

export function pathForControlView(view: ControlView) {
  return view === "home" ? "/" : `/${view}`
}

export function controlViewFromPath(pathname: string): ControlView | null {
  if (pathname === "/") return "home"
  const segment = pathname.replace(/^\/|\/$/g, "")
  return isControlView(segment) ? segment : null
}

export function mayOpenControlView(
  view: ControlView,
  capabilities: readonly string[],
) {
  if (view === "home" || view === "configuration") return true
  const granted = new Set(capabilities)
  return (requiredCapability[view] ?? []).some((capability) =>
    granted.has(capability),
  )
}

export const controlWorkspaceCopyKeys = {
  home: {
    title: "workspace.home.title",
    description: "workspace.home.description",
  },
  orders: {
    title: "workspace.orders.title",
    description: "workspace.orders.description",
  },
  customers: {
    title: "workspace.customers.title",
    description: "workspace.customers.description",
  },
  team: {
    title: "workspace.team.title",
    description: "workspace.team.description",
  },
  security: {
    title: "workspace.security.title",
    description: "workspace.security.description",
  },
  configuration: {
    title: "workspace.configuration.title",
    description: "workspace.configuration.description",
  },
} as const satisfies Readonly<
  Record<ControlView, { title: string; description: string }>
>
