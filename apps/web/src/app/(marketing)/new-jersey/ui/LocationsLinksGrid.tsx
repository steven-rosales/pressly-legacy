import Link from 'next/link';

type GridItem =
  | { label: string; primaryHref: string; secondaryHref?: undefined }
  | { label: string; primaryHref: string; secondaryHref: string };

interface LocationsLinksGridProps {
  heading: string;
  items: readonly GridItem[];
}

export function LocationsLinksGrid({
  heading,
  items,
}: LocationsLinksGridProps) {
  return (
    <section className="bg-background py-28 lg:py-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6">
        <h2 className="text-center text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
          {heading}
        </h2>
        <div className="grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={`${item.label}-${item.primaryHref}`}
              className="flex flex-col gap-1"
            >
              <Link
                href={item.primaryHref}
                className="text-lg font-semibold text-foreground hover:text-foreground/80"
              >
                {item.label}
              </Link>
              {item.secondaryHref ? (
                <div className="text-sm font-semibold text-primary">
                  <Link
                    href={item.primaryHref}
                    className="hover:text-primary/80"
                  >
                    Laundry
                  </Link>
                  <span className="mx-1 text-primary/60">/</span>
                  <Link
                    href={item.secondaryHref}
                    className="hover:text-primary/80"
                  >
                    Dry Cleaning
                  </Link>
                </div>
              ) : (
                <div className="text-sm font-semibold text-primary">
                  <Link
                    href={item.primaryHref}
                    className="hover:text-primary/80"
                  >
                    View service area
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
