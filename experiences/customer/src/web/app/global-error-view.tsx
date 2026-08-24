'use client';

export const CustomerGlobalErrorView = ({
  retry,
  reload,
}: Readonly<{ retry: () => void; reload: () => void }>) => (
  <html lang="en">
    <body className="bg-background text-foreground">
      <main className="grid min-h-screen place-items-center px-6 py-16">
        <section
          className="w-full max-w-lg space-y-5 rounded-2xl border bg-white p-8 shadow-sm"
          role="alert"
        >
          <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
            Pressly
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            We hit an unexpected problem.
          </h1>
          <p className="text-muted-foreground leading-7">
            Your request was not completed. Try again, or reload the page if the
            problem continues.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800"
              type="button"
              onClick={retry}
            >
              Try again
            </button>
            <button
              className="rounded-lg border px-4 py-2.5 font-medium hover:bg-slate-50"
              type="button"
              onClick={reload}
            >
              Reload page
            </button>
          </div>
        </section>
      </main>
    </body>
  </html>
);
