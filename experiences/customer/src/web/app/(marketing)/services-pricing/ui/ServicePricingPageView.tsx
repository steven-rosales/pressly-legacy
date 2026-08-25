import { JsonLd } from '#customer/app/_components/JsonLd';

import type { ServicePricingPageModel } from '../model';
import DeliveryInfo from './DeliveryInfo';
import OtherServices from './OtherServices';
import ServiceBottomSection from './ServiceBottomSection';
import ServiceHero from './ServiceHero';
import ServicesHiw from './ServicesHiw';
import DryCleaningPricing from '../dry-cleaning/ui/DryCleaningPricing';
import WashFoldPricing from '../wash-fold/ui/WashFoldPricing';

export default function ServicePricingPageView({
  model,
}: {
  model: ServicePricingPageModel;
}) {
  return (
    <>
      <JsonLd data={model.jsonLd} />
      <section className="mx-auto max-w-[1440px] px-4 pt-12 pb-[88px] sm:px-6 lg:py-20">
        <ServiceHero
          title={model.hero.title}
          description={model.hero.description}
          imageSrc={model.hero.imageSrc}
          imageAlt={model.hero.imageAlt}
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <ServicesHiw title={model.hiw.title} steps={model.hiw.steps} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        {model.pricing.service === 'wash-fold' ? (
          <WashFoldPricing model={model.pricing.model} />
        ) : (
          <DryCleaningPricing model={model.pricing.model} />
        )}
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <OtherServices
          title={model.otherServices.title}
          subtitle={model.otherServices.subtitle}
          services={model.otherServices.services}
          imageSrc={model.otherServices.imageSrc}
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <DeliveryInfo
          description={model.delivery.description}
          details={model.delivery.details}
          imageSrc={model.delivery.imageSrc}
        />
      </section>

      <ServiceBottomSection
        title={model.bottom.title}
        description={model.bottom.description}
      />
    </>
  );
}
