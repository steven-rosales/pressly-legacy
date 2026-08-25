import { lazy, Suspense } from "react"
import { Button } from "../components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../components/ui/empty"
import { Spinner } from "../components/ui/spinner"
import { WorkspaceSectionHeading } from "../components/layout/workspace-section-heading"
import type { WorkspaceNavigationSection } from "../components/layout/workspace-shell"
import { IconArrowRight } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import type { ControlView } from "./control-navigation"
import type { ControlRuntime } from "./control-runtime"
import type { ControlAuthenticatedSession } from "../contracts/authentication.ts"

const TeamWorkspace = lazy(() =>
  import("../../features/team/team-workspace").then((module) => ({
    default: module.TeamWorkspace,
  })),
)
const SecurityWorkspace = lazy(() =>
  import("../../features/security/security-workspace").then((module) => ({
    default: module.SecurityWorkspace,
  })),
)
const CustomerWorkspace = lazy(() =>
  import("../../features/customers/customer-workspace").then((module) => ({
    default: module.CustomerWorkspace,
  })),
)
const OrderWorkspace = lazy(() =>
  import("../../features/orders/order-workspace").then((module) => ({
    default: module.OrderWorkspace,
  })),
)
const ConfigurationWorkspace = lazy(() =>
  import("../../features/configuration/configuration-workspace").then(
    (module) => ({
      default: module.ConfigurationWorkspace,
    }),
  ),
)

const homeDescriptionKeys = {
  home: "home.description",
  orders: "home.cards.orders.description",
  customers: "home.cards.customers.description",
  team: "home.cards.team.description",
  security: "home.cards.security.description",
  configuration: "home.cards.configuration.description",
} as const satisfies Readonly<Record<ControlView, string>>

function HomeContent({
  sections,
  onNavigate,
}: {
  sections: readonly WorkspaceNavigationSection<ControlView>[]
  onNavigate: (view: ControlView) => void
}) {
  const { t } = useTranslation()
  const destinations = sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      sectionLabel: section.label,
    })),
  )

  return (
    <section
      aria-labelledby="control-overview-title"
      className="flex flex-col gap-6"
    >
      <WorkspaceSectionHeading
        titleId="control-overview-title"
        title={t("home.title")}
        description={t("home.description")}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {destinations.map((destination) => {
          const Icon = destination.icon
          return (
            <Card key={destination.id}>
              <CardHeader>
                <CardTitle>{destination.label}</CardTitle>
                <CardDescription>
                  {t(homeDescriptionKeys[destination.id])}
                </CardDescription>
                <CardAction>
                  <div className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-lg">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs font-medium">
                  {destination.sectionLabel}
                </p>
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 sm:h-8"
                  aria-label={t("home.openWorkspaceLabel", {
                    workspace: destination.label,
                  })}
                  onClick={() => onNavigate(destination.id)}
                >
                  {t("home.openWorkspace")}
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

export function WorkspaceContent({
  view,
  runtime,
  session,
  onSessionRefresh,
  sections,
  onNavigate,
}: {
  view: ControlView
  runtime: ControlRuntime
  session: ControlAuthenticatedSession
  onSessionRefresh: () => Promise<void>
  sections: readonly WorkspaceNavigationSection<ControlView>[]
  onNavigate: (view: ControlView) => void
}) {
  const { t } = useTranslation()

  if (view === "home")
    return <HomeContent sections={sections} onNavigate={onNavigate} />
  if (view === "team")
    return (
      <Suspense
        fallback={<WorkspaceLoading label={t("workspace.loading.team")} />}
      >
        <TeamWorkspace api={runtime.team} session={session} />
      </Suspense>
    )
  if (view === "security")
    return (
      <Suspense
        fallback={<WorkspaceLoading label={t("workspace.loading.security")} />}
      >
        <SecurityWorkspace
          api={runtime.security}
          session={session}
          onSessionRefresh={onSessionRefresh}
        />
      </Suspense>
    )
  if (view === "customers")
    return (
      <Suspense
        fallback={<WorkspaceLoading label={t("workspace.loading.customers")} />}
      >
        <CustomerWorkspace api={runtime.customers} session={session} />
      </Suspense>
    )
  if (view === "configuration")
    return (
      <Suspense
        fallback={
          <WorkspaceLoading label={t("workspace.configuration.title")} />
        }
      >
        <ConfigurationWorkspace />
      </Suspense>
    )

  return (
    <Suspense
      fallback={<WorkspaceLoading label={t("workspace.loading.orders")} />}
    >
      <OrderWorkspace
        api={runtime.orders}
        customersApi={runtime.customers}
        session={session}
      />
    </Suspense>
  )
}

function WorkspaceLoading({ label }: { label: string }) {
  const { t } = useTranslation()

  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <Spinner />
        <EmptyTitle>{label}</EmptyTitle>
        <EmptyDescription>
          {t("workspace.loading.description")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
