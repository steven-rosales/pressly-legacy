import { IconLogout, IconMenu2, IconSparkles } from "@tabler/icons-react"
import type { ReactNode } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/components/ui/class-names"
import { workspaceNavigation, type WorkspaceView } from "./app.navigation"

function Navigation({
  current,
  onNavigate,
  compact = false,
}: {
  current: WorkspaceView
  onNavigate: (view: WorkspaceView) => void
  compact?: boolean
}) {
  return (
    <nav
      aria-label="Processor"
      className={cn("flex flex-col gap-1", compact && "grid grid-cols-3 gap-1")}
    >
      {workspaceNavigation.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          type="button"
          variant={current === id ? "secondary" : "ghost"}
          className={cn(
            "w-full justify-start",
            compact && "h-12 flex-col gap-0.5 px-1 text-[11px]"
          )}
          aria-current={current === id ? "page" : undefined}
          onClick={() => onNavigate(id)}
        >
          <Icon data-icon="inline-start" />
          {label}
        </Button>
      ))}
    </nav>
  )
}

export function AppShell({
  current,
  onNavigate,
  title,
  description,
  actions,
  locationName,
  timezone,
  principalName,
  logoutBusy,
  onLogout,
  children,
}: {
  current: WorkspaceView
  onNavigate: (view: WorkspaceView) => void
  title: string
  description: string
  actions?: ReactNode
  locationName: string
  timezone: string
  principalName: string
  logoutBusy: boolean
  onLogout: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar p-3 lg:flex lg:flex-col">
        <div className="flex h-12 items-center gap-2 px-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
            <IconSparkles className="size-4" aria-hidden="true" />
          </span>
          Pressly Processor
        </div>
        <Separator className="my-3" />
        <Navigation current={current} onNavigate={onNavigate} />
        <div className="mt-auto rounded-xl border bg-background p-3 text-xs text-muted-foreground shadow-xs">
          <p className="font-medium text-foreground">Laundry Production</p>
          <p className="mt-1">
            {locationName} · {timezone}
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                className="lg:hidden"
                size="icon"
                variant="ghost"
                aria-label="Open navigation"
              >
                <IconMenu2 />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader className="sr-only">
                <SheetTitle>Processor navigation</SheetTitle>
              </SheetHeader>
              <div className="mb-6 flex items-center gap-2 font-semibold">
                <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
                  <IconSparkles className="size-4" />
                </span>
                Pressly Processor
              </div>
              <Navigation current={current} onNavigate={onNavigate} />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {description}
            </p>
          </div>
          {actions}
          <Avatar aria-label={`Signed in as ${principalName}`}>
            <AvatarFallback>
              {principalName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase() || "OP"}
            </AvatarFallback>
          </Avatar>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Sign out"
            disabled={logoutBusy}
            onClick={onLogout}
          >
            <IconLogout />
          </Button>
        </header>

        <main className="mx-auto w-full max-w-[1540px] px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-7 lg:pb-8">
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-1.5 backdrop-blur-sm lg:hidden">
        <Navigation current={current} onNavigate={onNavigate} compact />
      </div>
    </div>
  )
}
