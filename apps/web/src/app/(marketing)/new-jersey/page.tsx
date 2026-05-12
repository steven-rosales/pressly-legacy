import type { Metadata } from 'next';

import { JsonLd } from '@/app/(marketing)/shared/marketing/JsonLd';
import SchedulePickupButton from '@/app/(marketing)/shared/ui/components/SchedulePickupButton';
import {
  DELIVERY_FEE_SHORT_COPY,
  OFFER_COPY,
} from '@/app/(marketing)/shared/marketing/content';
import {
  buildBreadcrumbJsonLd,
  buildStateMetadata,
  buildServiceJsonLd,
} from '@/app/(marketing)/shared/marketing/seo';
import {
  COUNTIES,
  LOCATIONS,
  makeTitle,
} from '@/app/(marketing)/new-jersey/content';
import { LocationsBottomSection } from './ui/LocationsBottomSection';
import LocationsDryCleaning from './ui/LocationsDryCleaning';
import { LocationsHero } from './ui/LocationsHero';
import { LocationsHiw } from './ui/LocationsHiw';
import { LocationsLinksGrid } from './ui/LocationsLinksGrid';
import { LocationsStory } from './ui/LocationsStory';
import LocationsTestimonials from './ui/LocationsTestimonials';
import LocationsWashFold from './ui/LocationsWashFold';

export const revalidate = 3600;
export const metadata: Metadata = buildStateMetadata();

export default function NewJerseyPage() {
  const representative = LOCATIONS[0];

  const description = makeTitle(
    'seoCityHeroDescription',
    1,
    { state: 'New Jersey' },
    undefined,
    'combined',
  );

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'New Jersey', path: '/new-jersey' },
        ])}
      />
      <JsonLd
        data={buildServiceJsonLd({
          name: 'New Jersey Laundry Service & Dry Cleaning',
          description,
          path: '/new-jersey',
          areaName: 'New Jersey',
          serviceType: 'combined',
        })}
      />
      <LocationsHero
        heroImage={
          representative?.heroImage ?? '/images/locations/default.webp'
        }
        heading="New Jersey Laundry Service & Dry Cleaning"
        description={description}
        cta={
          <SchedulePickupButton source="location_hero">
            Schedule a Pickup
          </SchedulePickupButton>
        }
        offerText={OFFER_COPY}
        cityName="New Jersey"
      />
      <LocationsHiw
        heading="How your laundry and dry cleaning pickup works."
        steps={[
          {
            title: makeTitle(
              'hiwTitleSchedule',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionSchedule',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
          },
          {
            title: makeTitle(
              'hiwTitlePickup',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionPickup',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
          },
          {
            title: makeTitle(
              'hiwTitleClean',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionClean',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
          },
          {
            title: makeTitle(
              'hiwTitleDeliver',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
            description: makeTitle(
              'hiwDescriptionDeliver',
              undefined,
              { state: 'New Jersey' },
              undefined,
              'combined',
            ),
          },
        ]}
      />

      <section className="mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20">
        <LocationsWashFold />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20">
        <LocationsDryCleaning />
      </section>

      <LocationsStory
        title="Pressly & New Jersey"
        heading="Complete laundry and dry cleaning across New Jersey"
        paragraphs={[
          makeTitle(
            'seoCityDescriptionParagraph1',
            undefined,
            { state: 'New Jersey' },
            undefined,
            'combined',
          ),
          makeTitle(
            'seoCityDescriptionParagraph2',
            undefined,
            { state: 'New Jersey' },
            undefined,
            'combined',
          ),
          makeTitle(
            'seoCityDescriptionParagraph3',
            undefined,
            { state: 'New Jersey' },
            undefined,
            'combined',
          ),
        ]}
        heroImage={representative?.heroImage}
        locationLabel="New Jersey"
      />

      <LocationsLinksGrid
        heading="Service by County"
        items={COUNTIES.map((county) => ({
          label: county
            .replace('-county', '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          primaryHref: `/new-jersey/${county}`,
        }))}
      />

      <section className="mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20">
        <LocationsTestimonials />
      </section>

      <LocationsBottomSection
        title="All your garment care, one warm pickup away."
        description={`From everyday laundry to pressed dry cleaning, schedule one visit and we'll handle it all with a ${DELIVERY_FEE_SHORT_COPY}, returned fresh, and folded or pressed the way you like.`}
      />
    </>
  );
}
