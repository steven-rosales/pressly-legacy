import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  buildCityServiceParams,
  getLocalProof,
  makeTitle,
  resolveCityService,
} from '@/app/(marketing)/new-jersey/content';
import { OFFER_COPY } from '@/app/(marketing)/shared/marketing/content';
import { JsonLd } from '@/app/(marketing)/shared/marketing/JsonLd';
import {
  buildCityServiceMetadata,
  buildLocationPageJsonLd,
  formatCountyName,
} from '@/app/(marketing)/shared/marketing/seo';
import SchedulePickupButton from '@/app/(marketing)/shared/ui/components/SchedulePickupButton';
import { LocationsBottomSection } from '../../ui/LocationsBottomSection';
import LocationsDryCleaning from '../../ui/LocationsDryCleaning';
import { LocationsHero } from '../../ui/LocationsHero';
import { LocationsHiw } from '../../ui/LocationsHiw';
import { LocationsLocalProof } from '../../ui/LocationsLocalProof';
import { LocationsStory } from '../../ui/LocationsStory';
import LocationsTestimonials from '../../ui/LocationsTestimonials';
import LocationsWashFold from '../../ui/LocationsWashFold';

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return buildCityServiceParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string; slug: string }>;
}): Promise<Metadata> {
  const { county, slug } = await params;
  const resolved = resolveCityService(county, slug);

  if (!resolved) notFound();

  return buildCityServiceMetadata({
    location: resolved.location,
    serviceType: resolved.serviceType,
  });
}

export default async function CityServicePage({
  params,
}: {
  params: Promise<{ county: string; slug: string }>;
}) {
  const { county, slug } = await params;
  if (!county || !slug) return notFound();

  const resolved = resolveCityService(county, slug);
  if (!resolved) return notFound();

  const { location, serviceConfig, serviceType } = resolved;
  const { cityName, heroImage, versions } = location;
  const countyName = formatCountyName(county);
  const proof = getLocalProof(location, serviceType);
  const path = `/new-jersey/${county}/${slug}`;

  const heading = `${cityName} ${
    serviceConfig.serviceTitle === 'Dry Cleaning'
      ? 'Dry Cleaning'
      : 'Wash & Fold'
  } ${serviceConfig.isDryCleaningService ? 'Delivery Service' : 'Laundry Service'}`;

  const description = makeTitle(
    'seoCityHeroDescription',
    versions?.seoCityHeroDescription ?? 1,
    { city: cityName },
    undefined,
    serviceType,
  );

  return (
    <>
      <JsonLd
        data={buildLocationPageJsonLd({
          location,
          serviceType,
          name: heading,
          description,
          path,
          breadcrumbs: [
            { name: 'Home', path: '/' },
            { name: 'New Jersey', path: '/new-jersey' },
            { name: `${countyName} County`, path: `/new-jersey/${county}` },
            { name: heading, path },
          ],
          faqs: proof.faqs,
        })}
      />
      <LocationsHero
        heroImage={heroImage}
        heading={heading}
        description={description}
        cta={
          <SchedulePickupButton source="location_hero">
            Schedule a Pickup
          </SchedulePickupButton>
        }
        offerText={OFFER_COPY}
        cityName={cityName}
      />
      <LocationsHiw
        heading={
          serviceType === 'dryCleaning'
            ? `How your dry cleaning pickup works in ${cityName}.`
            : `How your laundry pickup works in ${cityName}`
        }
        steps={[
          {
            title: makeTitle(
              'seoCityHIWTitleSchedule',
              versions?.seoCityHIWTitleSchedule,
              { city: cityName },
              undefined,
              serviceType,
            ),
            description: makeTitle(
              'seoCityHIWDescriptionSchedule',
              versions?.seoCityHIWDescriptionSchedule,
              { city: cityName },
              undefined,
              serviceType,
            ),
          },
          {
            title: makeTitle(
              'seoCityHIWTitlePickup',
              versions?.seoCityHIWTitlePickup,
              { city: cityName },
              undefined,
              serviceType,
            ),
            description: makeTitle(
              'seoCityHIWDescriptionPickup',
              versions?.seoCityHIWDescriptionPickup,
              { city: cityName },
              undefined,
              serviceType,
            ),
          },
          {
            title: makeTitle(
              'seoCityHIWTitleClean',
              versions?.seoCityHIWTitleClean,
              { city: cityName },
              undefined,
              serviceType,
            ),
            description: makeTitle(
              'seoCityHIWDescriptionClean',
              versions?.seoCityHIWDescriptionClean,
              { city: cityName },
              undefined,
              serviceType,
            ),
          },
          {
            title: makeTitle(
              'seoCityHIWTitleDeliver',
              versions?.seoCityHIWTitleDeliver,
              { city: cityName },
              undefined,
              serviceType,
            ),
            description: makeTitle(
              'seoCityHIWDescriptionDeliver',
              versions?.seoCityHIWDescriptionDeliver,
              { city: cityName },
              undefined,
              serviceType,
            ),
          },
        ]}
      />

      <section className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:py-20">
        {serviceType === 'dryCleaning' ? (
          <LocationsDryCleaning />
        ) : (
          <LocationsWashFold />
        )}
      </section>

      <LocationsStory
        title={`Pressly & ${cityName}`}
        heading={makeTitle(
          'seoCityDescriptionTitle',
          versions?.seoCityDescriptionTitle,
          { city: cityName },
          undefined,
          serviceType,
        )}
        paragraphs={[
          makeTitle(
            'seoCityDescription',
            versions?.seoCityDescription,
            { city: cityName },
            undefined,
            serviceType,
          ),
        ]}
        heroImage={heroImage}
        locationLabel={cityName}
      />

      <LocationsLocalProof proof={proof} />

      <section className="mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20">
        <LocationsTestimonials />
      </section>

      {serviceType === 'dryCleaning' ? (
        <LocationsBottomSection
          title={`Pressed and ready in ${cityName}`}
          description="Schedule your dry cleaning pickup, and we'll return your garments pressed, crisp, and ready to wear—no extra errands, just a warm hand-off at your door."
        />
      ) : (
        <LocationsBottomSection
          title={`Never fold again in ${cityName}`}
          description="Book a pickup, hand off your laundry, and get everything back fresh, soft, and neatly folded. It's the easiest way to keep your week light."
        />
      )}
    </>
  );
}
