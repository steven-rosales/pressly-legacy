import Link from 'next/link';

import Footer from '#customer/app/_components/public/Footer';
import NavBar from '#customer/app/_components/public/NavBar';
import { Button } from '#customer/components/ui/button';

export default function NotFound() {
  return (
    <>
      <NavBar />
      <main className="bg-background">
        <section className="max-w-360 mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-24 text-center sm:px-6 lg:py-32">
          <p className="text-6xl font-bold text-muted-foreground/50 sm:text-7xl lg:text-8xl">
            404
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-foreground sm:text-3xl">
            Page not found
          </h1>
          <p className="mt-2 max-w-md text-base text-muted-foreground sm:text-lg">
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </p>
          <div className="mt-8">
            <Button
              asChild
              size="lg"
              className="cursor-pointer bg-primary text-base text-primary-foreground"
            >
              <Link href="/">Go Home</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
