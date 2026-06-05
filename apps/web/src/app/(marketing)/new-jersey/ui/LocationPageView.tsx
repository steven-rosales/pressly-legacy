import { JsonLd } from '@/app/shared/marketing/JsonLd';
import SchedulePickupButton from '@/app/shared/ui/components/SchedulePickupButton';

import type { LocationPageModel } from '../model';
import { LocationsBottomSection } from './LocationsBottomSection';
import LocationsDryCleaning from './LocationsDryCleaning';
import { LocationsHero } from './LocationsHero';
import { LocationsHiw } from './LocationsHiw';
import { LocationsLinksGrid } from './LocationsLinksGrid';
import { LocationsLocalProof } from './LocationsLocalProof';
import { LocationsStory } from './LocationsStory';
import LocationsTestimonials from './LocationsTestimonials';
import LocationsWashFold from './LocationsWashFold';

export function LocationPageView({ model }: { model: LocationPageModel }) {
  return (
    <>
      {model.jsonLd.map((data, index) => (
        <JsonLd key={index} data={data} />
      ))}
      <LocationsHero
        heroImage={model.hero.image}
        heading={model.hero.heading}
        description={model.hero.description}
        cta={
          <SchedulePickupButton source={model.hero.ctaSource}>
            Schedule a Pickup
          </SchedulePickupButton>
        }
        offerText={model.hero.offerText}
        cityName={model.hero.cityName}
      />
      <LocationsHiw heading={model.hiw.heading} steps={model.hiw.steps} />

      {model.servicePanels.map((panel) => (
        <section key={panel.service} className={model.serviceSectionClassName}>
          {panel.service === 'dryCleaning' ? (
            <LocationsDryCleaning pricing={panel.pricing} />
          ) : (
            <LocationsWashFold pricing={panel.pricing} />
          )}
        </section>
      ))}

      <LocationsStory
        title={model.story.title}
        heading={model.story.heading}
        paragraphs={model.story.paragraphs}
        heroImage={model.story.heroImage}
        locationLabel={model.story.locationLabel}
      />

      {model.localProof === undefined ? null : (
        <LocationsLocalProof proof={model.localProof} />
      )}

      {model.linksGrid === undefined ? null : (
        <LocationsLinksGrid
          heading={model.linksGrid.heading}
          items={model.linksGrid.items}
        />
      )}

      <section className={model.testimonialsClassName}>
        <LocationsTestimonials />
      </section>

      <LocationsBottomSection
        title={model.bottom.title}
        description={model.bottom.description}
      />
    </>
  );
}
