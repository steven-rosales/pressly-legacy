import { notFound } from 'next/navigation';

import { JsonLd } from '@/routes/shared/marketing/JsonLd';
import SchedulePickupButton from '@/routes/shared/ui/components/SchedulePickupButton';
import { OFFER_COPY } from '@/routes/shared/marketing/content';
import {
  buildBreadcrumbJsonLd,
  buildServiceJsonLd,
  formatCountyName,
} from '@/routes/shared/marketing/seo';
import {
  COUNTIES,
  COUNTY_CITIES,
  LOCATIONS,
  makeTitle,
} from '@/routes/new-jersey/content';
import { LocationsBottomSection } from '../ui/LocationsBottomSection';
import LocationsDryCleaning from '../ui/LocationsDryCleaning';
import { LocationsHero } from '../ui/LocationsHero';
import { LocationsHiw } from '../ui/LocationsHiw';
import { LocationsLinksGrid } from '../ui/LocationsLinksGrid';
import { LocationsStory } from '../ui/LocationsStory';
import LocationsTestimonials from '../ui/LocationsTestimonials';
import LocationsWashFold from '../ui/LocationsWashFold';

export const revalidate = 3600;

export function generateStaticParams() {
  return COUNTIES.map((county) => ({ county }));
}

export default async function CountyRoute({
  params,
}: {
  params: Promise<{ county: string }>;
}) {
  const { county: countySlug } = await params;
  if (!countySlug) return notFound();

  const representative = LOCATIONS.find((loc) => loc.county === countySlug);
  if (!representative) return notFound();

  const formattedCounty = formatCountyName(countySlug);

  const description = makeTitle(
    'seoCityHeroDescription',
    representative.versions?.seoCityHeroDescription ?? 1,
    { county: formattedCounty },
    undefined,
    'combined',
  );

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'New Jersey', path: '/new-jersey' },
          {
            name: `${formattedCounty} County`,
            path: `/new-jersey/${countySlug}`,
          },
        ])}
      />
      <JsonLd
        data={buildServiceJsonLd({
          name: `${formattedCounty} County Laundry Service & Dry Cleaning`,
          description,
          path: `/new-jersey/${countySlug}`,
          areaName: `${formattedCounty} County, New Jersey`,
          serviceType: 'combined',
        })}
      />
      <LocationsHero
        heroImage={representative.heroImage}
        heading={`${formattedCounty} County Laundry Service & Dry Cleaning`}
        description={description}
        cta={
          <SchedulePickupButton source="location_hero">
            Schedule a Pickup
          </SchedulePickupButton>
        }
        offerText={OFFER_COPY}
        cityName={formattedCounty}
      />
      <LocationsHiw
        heading="How your laundry and dry cleaning pickup works."
        steps={[
          {
            title: makeTitle(
              'hiwTitleSchedule',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionSchedule',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
          },
          {
            title: makeTitle(
              'hiwTitlePickup',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionPickup',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
          },
          {
            title: makeTitle(
              'hiwTitleClean',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionClean',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
          },
          {
            title: makeTitle(
              'hiwTitleDeliver',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionDeliver',
              undefined,
              { county: formattedCounty },
              undefined,
              'combined',
            ),
          },
        ]}
      />

      <section className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:py-20">
        <LocationsWashFold />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:py-20">
        <LocationsDryCleaning />
      </section>

      <LocationsStory
        title={`Pressly & ${formattedCounty}`}
        heading={`${formattedCounty} County laundry & dry cleaning`}
        paragraphs={[
          makeTitle(
            'seoCityDescriptionParagraph1',
            undefined,
            { county: formattedCounty },
            undefined,
            'combined',
          ),
          makeTitle(
            'seoCityDescriptionParagraph2',
            undefined,
            { county: formattedCounty },
            undefined,
            'combined',
          ),
          makeTitle(
            'seoCityDescriptionParagraph3',
            undefined,
            { county: formattedCounty },
            undefined,
            'combined',
          ),
        ]}
        heroImage={representative.heroImage}
        locationLabel={formattedCounty}
      />

      <LocationsLinksGrid
        heading={`Neighborhoods we serve in ${formattedCounty} County`}
        items={(COUNTY_CITIES[countySlug] ?? []).map(
          (city: { name: string; slug: string }) => ({
            label: city.name,
            primaryHref: `/new-jersey/${countySlug}/laundry-service-in-${city.slug}`,
            secondaryHref: `/new-jersey/${countySlug}/dry-cleaners-in-${city.slug}`,
          }),
        )}
      />

      <section className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:py-20">
        <LocationsTestimonials />
      </section>

      <LocationsBottomSection
        title={`Laundry and dry cleaning made easy in ${formattedCounty} County`}
        description="Schedule one warm pickup for wash & fold and dry cleaning together. We'll collect everything, clean with care, and deliver it back fresh and ready to wear."
      />
    </>
  );
}
