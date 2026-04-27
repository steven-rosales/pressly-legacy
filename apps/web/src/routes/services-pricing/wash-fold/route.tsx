import Image from 'next/image';
import { JsonLd } from '@/common/seo/JsonLd';
import ServicesHiw from '../ui/ServicesHiw';
import { DELIVERY_FEE_COPY, DELIVERY_FEE_LABEL, PRICING } from '@/lib/content';
import { buildServicePricingPageJsonLd } from '@/lib/seo';
import {
  formatQuantity,
  formatUsdShortFromCents,
} from '@/routes/services-pricing/presenter';
import DeliveryInfo from '../ui/DeliveryInfo';
import OtherServices from '../ui/OtherServices';
import ServiceBottomSection from '../ui/ServiceBottomSection';
import ServiceHero from '../ui/ServiceHero';
import WashFoldPricing from './ui/WashFoldPricing';

export const revalidate = 3600;

function WashFoldStepImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-square w-full max-w-[108px] overflow-hidden sm:max-w-[150px] lg:max-w-[200px]">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-contain"
        sizes="(max-width: 640px) 120px, (max-width: 1024px) 160px, 200px"
      />
    </div>
  );
}

export default async function WashFoldRoute() {
  const pricing = null;
  const minimumCents = 3000;
  const thresholdLbs = 18;

  return (
    <>
      <JsonLd
        data={buildServicePricingPageJsonLd({
          name: 'Wash & Fold Laundry Service',
          description:
            'Pressly wash and fold laundry pickup and delivery with clear per-pound pricing, a delivery fee, and online scheduling.',
          path: '/services-pricing/wash-fold',
          areaName: 'New Jersey',
          serviceType: 'washFold',
          breadcrumbs: [
            { name: 'Home', path: '/' },
            {
              name: 'Wash & Fold Laundry Service',
              path: '/services-pricing/wash-fold',
            },
          ],
        })}
      />
      <section className="mx-auto max-w-[1440px] px-4 pt-12 pb-[88px] sm:px-6 lg:py-20">
        <ServiceHero
          title="Wash & Fold"
          description={[
            "Wash & Fold is the best option if you're exhausted of wasting time and energy doing laundry during your free time.",
            'Your laundry will be picked up, cleaned, and delivered by Pressly. Everything in your bag will be cleaned to your preferences by our laundry experts.',
            "There's always better things to do than laundry, let Pressly professionally take this tedious chore off your hands.",
          ]}
          imageSrc="/graphic-img/wash-fold.webp"
          imageAlt="Wash and fold laundry service"
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <ServicesHiw
          title="How a wash & fold service works."
          steps={[
            {
              title: "We'll inspect and sort your clothing",
              description:
                "We'll check your pockets for any unwanted items and sort your darks and whites before washing.",
              media: (
                <WashFoldStepImage
                  src="/graphic-img/wf-1.png.webp"
                  alt="Wash and fold laundry inspection and sorting"
                />
              ),
            },
            {
              title: 'Your clothes will be cleaned with your preferences',
              description:
                "Our launderers will clean your laundry with your preferences you've set up in your account.",
              media: (
                <WashFoldStepImage
                  src="/graphic-img/wf-2.png.webp"
                  alt="Wash and fold laundry cleaned to preferences"
                />
              ),
            },
            {
              title: "We'll dry all your clothes in low setting",
              description:
                'We set the drying on a low temperature setting to avoid any tearing and / or shrinking.',
              media: (
                <WashFoldStepImage
                  src="/graphic-img/wf-3.png.webp"
                  alt="Wash and fold laundry low heat drying"
                />
              ),
            },
            {
              title: 'Everything will be folded and ready to put away',
              description:
                "Your clothes will be professionally folded using Pressly's methods so it can be ready to put away when you receive it.",
              media: (
                <WashFoldStepImage
                  src="/graphic-img/wf-4.png.webp"
                  alt="Folded wash and fold laundry ready to put away"
                />
              ),
            },
          ]}
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <WashFoldPricing pricing={pricing} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <OtherServices
          title="Other Services"
          subtitle="Check out other laundry services Pressly offers."
          services={[
            {
              title: 'Hang Dry',
              price: '$2.95',
              description:
                'Priced per item. Perfect for everyday delicate items you want to have washed, hung to dry, and neatly folded.',
            },
          ]}
          imageSrc="/graphic-img/wf-other-services.webp"
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <DeliveryInfo
          description="Pressly's services are available 7-days a week, between 7pm-9pm. You may turn on contactless delivery when scheduling your first pickup or inside your account preferences."
          details={[
            {
              title: DELIVERY_FEE_LABEL,
              price: formatUsdShortFromCents(PRICING.deliveryFeeCents),
              description: DELIVERY_FEE_COPY,
            },
            {
              title: 'Minimum',
              price: formatUsdShortFromCents(minimumCents),
              description: `Minimum will be waived for orders above ${formatQuantity(
                thresholdLbs,
              )} lbs. For orders ${formatQuantity(
                thresholdLbs,
              )} lbs or lower, Pressly charges your per-pound laundry and any specialty items, then only adds a minimum adjustment if that subtotal is below ${formatUsdShortFromCents(
                minimumCents,
              )}.`,
            },
          ]}
          imageSrc="/graphic-img/wf-delivery.webp"
        />
      </section>

      <ServiceBottomSection
        title="Enjoy Fresh Laundry Without the Work"
        description="We get it, you’ve got plenty on your plate. Leave the laundry to us and enjoy a little more ease, a little more comfort, and a lot more free time."
      />
    </>
  );
}
