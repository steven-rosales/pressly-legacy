import {
  IconApps,
  IconChevronDown,
  IconLogout,
  IconMenu2,
  IconSparkles,
  type Icon,
} from "@tabler/icons-react"
import { useState, type ReactNode } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export type WorkspaceApplicationDestination = Readonly<{
  id: string
  label: string
  description: string
  href: string
}>

export type WorkspaceNavigationItem<View extends string> = Readonly<{
  id: View
  label: string
  icon: Icon
}>

export type WorkspaceNavigationSection<View extends string> = Readonly<{
  id: string
  label: string
  items: readonly WorkspaceNavigationItem<View>[]
}>

function BrandMark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-background">
      <IconSparkles aria-hidden="true" />
    </span>
  )
}

function ApplicationSwitcher({
  currentApplicationId,
  applicationName,
  applications,
  applicationsLabel,
  switchApplicationLabel,
}: {
  currentApplicationId: string
  applicationName: string
  applications: readonly WorkspaceApplicationDestination[]
  applicationsLabel: string
  switchApplicationLabel: string
}) {
  const availableApplications = applications.filter(
    (application) => application.id !== currentApplicationId
  )

  if (availableApplications.length === 0) {
    return (
      <div className="flex h-12 min-w-0 items-center gap-2 px-2">
        <BrandMark />
        <span className="truncate text-sm font-semibold tracking-tight">
          {applicationName}
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-12 w-full min-w-0 justify-start px-2"
          aria-label={switchApplicationLabel}
        >
          <BrandMark />
          <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold tracking-tight">
            {applicationName}
          </span>
          <IconChevronDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{applicationsLabel}</DropdownMenuLabel>
          {availableApplications.map((application) => (
            <DropdownMenuItem key={application.id} asChild>
              <a href={application.href}>
                <IconApps data-icon="inline-start" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">
                    {application.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {application.description}
                  </span>
                </span>
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WorkspaceNavigation<View extends string>({
  current,
  home,
  sections,
  navigationLabel,
  onNavigate,
}: {
  current: View | null
  home: WorkspaceNavigationItem<View>
  sections: readonly WorkspaceNavigationSection<View>[]
  navigationLabel: string
  onNavigate: (view: View) => void
}) {
  const HomeIcon = home.icon

  return (
    <nav aria-label={navigationLabel} className="flex flex-col gap-4">
      <Button
        type="button"
        variant={current === home.id ? "secondary" : "ghost"}
        className="w-full justify-start"
        aria-current={current === home.id ? "page" : undefined}
        onClick={() => onNavigate(home.id)}
      >
        <HomeIcon data-icon="inline-start" />
        {home.label}
      </Button>
      {sections.map((section) => (
        <div key={section.id}>
          <p className="mb-1 px-3 text-xs text-muted-foreground">
            {section.label}
          </p>
          <div className="flex flex-col gap-1">
            {section.items.map(({ id, label, icon: IconComponent }) => (
              <Button
                key={id}
                type="button"
                variant={current === id ? "secondary" : "ghost"}
                className="w-full justify-start"
                aria-current={current === id ? "page" : undefined}
                onClick={() => onNavigate(id)}
              >
                <IconComponent data-icon="inline-start" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function WorkspaceShell<View extends string>({
  current,
  onNavigate,
  title,
  description,
  actions,
  currentApplicationId,
  applicationName,
  applications,
  applicationsLabel = "Pressly applications",
  switchApplicationLabel,
  home,
  sections,
  navigationLabel,
  navigationDialogTitle,
  navigationDialogDescription,
  openNavigationLabel,
  skipToContentLabel = "Skip to main content",
  closeLabel,
  signedInLabel,
  signOutLabel,
  principalName,
  logoutBusy,
  onLogout,
  footer,
  children,
}: {
  current: View | null
  onNavigate: (view: View) => void
  title: string
  description: string
  actions?: ReactNode
  currentApplicationId: string
  applicationName: string
  applications: readonly WorkspaceApplicationDestination[]
  applicationsLabel?: string
  switchApplicationLabel?: string
  home: WorkspaceNavigationItem<View>
  sections: readonly WorkspaceNavigationSection<View>[]
  navigationLabel: string
  navigationDialogTitle: string
  navigationDialogDescription: string
  openNavigationLabel: string
  skipToContentLabel?: string
  closeLabel: string
  signedInLabel: string
  signOutLabel: string
  principalName: string
  logoutBusy: boolean
  onLogout: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const principalInitials =
    principalName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "OP"
  const resolvedSwitchApplicationLabel =
    switchApplicationLabel ?? `Switch from ${applicationName}`

  const navigation = (
    <WorkspaceNavigation
      current={current}
      home={home}
      sections={sections}
      navigationLabel={navigationLabel}
      onNavigate={onNavigate}
    />
  )

  return (
    <div className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <a
        href="#pressly-workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        {skipToContentLabel}
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar p-3 lg:flex lg:flex-col">
        <ApplicationSwitcher
          currentApplicationId={currentApplicationId}
          applicationName={applicationName}
          applications={applications}
          applicationsLabel={applicationsLabel}
          switchApplicationLabel={resolvedSwitchApplicationLabel}
        />
        <Separator className="my-3" />
        {navigation}
        {footer === undefined ? null : (
          <div className="mt-auto rounded-xl border bg-background p-3 text-xs text-muted-foreground">
            {footer}
          </div>
        )}
      </aside>

      <div className="flex h-full min-w-0 flex-col lg:pl-64">
        <header className="z-20 flex min-h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <Sheet
            open={mobileNavigationOpen}
            onOpenChange={setMobileNavigationOpen}
          >
            <SheetTrigger asChild>
              <Button
                type="button"
                className="lg:hidden"
                size="icon"
                variant="ghost"
                aria-label={openNavigationLabel}
              >
                <IconMenu2 />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 p-4"
              closeLabel={closeLabel}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{navigationDialogTitle}</SheetTitle>
                <SheetDescription>
                  {navigationDialogDescription}
                </SheetDescription>
              </SheetHeader>
              <div className="mb-6">
                <ApplicationSwitcher
                  currentApplicationId={currentApplicationId}
                  applicationName={applicationName}
                  applications={applications}
                  applicationsLabel={applicationsLabel}
                  switchApplicationLabel={resolvedSwitchApplicationLabel}
                />
              </div>
              <WorkspaceNavigation
                current={current}
                home={home}
                sections={sections}
                navigationLabel={navigationLabel}
                onNavigate={(view) => {
                  setMobileNavigationOpen(false)
                  onNavigate(view)
                }}
              />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {description}
            </p>
          </div>
          {actions}
          <Avatar aria-label={signedInLabel}>
            <AvatarFallback>{principalInitials}</AvatarFallback>
          </Avatar>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={signOutLabel}
            disabled={logoutBusy}
            onClick={onLogout}
          >
            <IconLogout />
          </Button>
        </header>

        <div
          key={current}
          data-slot="workspace-scroll-region"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <main
            id="pressly-workspace-main"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 lg:pb-8"
          >
            <div>
              <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {description}
              </p>
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
