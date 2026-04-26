'use client';

import { Button } from '@/common/shadcn/button';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
          <div className="space-y-6 rounded-2xl border border-border bg-background p-8 shadow-sm">
            <header className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Something went wrong
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                The page couldn&apos;t load. Please try again.
              </p>
            </header>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <h2 className="text-base font-semibold text-foreground">
                We hit a snag
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Refresh the page or go back home to keep scheduling through
                Pressly.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="rounded-full"
                onClick={() => {
                  if (reset) reset();
                  else window.location.reload();
                }}
              >
                Try again
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  window.location.href = '/';
                }}
              >
                Go to home
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
