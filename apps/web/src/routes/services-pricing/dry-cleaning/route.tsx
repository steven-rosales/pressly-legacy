import Image from 'next/image';
import { JsonLd } from '@/common/seo/JsonLd';
import ServicesHiw from '@/common/ui/templates/ServicesHiw';
import { buildBreadcrumbJsonLd, buildServiceJsonLd } from '@/lib/seo';
import {
  DeliveryInfo,
  DryCleaningPricing,
  OtherServices,
  ServiceBottomSection,
  ServiceHero,
} from '@/routes/shared/marketing/public';
import { formatUsdShortFromCents } from '@/routes/services-pricing/pricing';

export const revalidate = 3600;

function DryCleaningStepImage({ src, alt }: { src: string; alt: string }) {
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

export default async function DryCleaningRoute() {
  const pricing = null;
  const minimumCents = 3000;

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: 'Home', path: '/' },
          {
            name: 'Dry Cleaning Pickup and Delivery',
            path: '/services-pricing/dry-cleaning',
          },
        ])}
      />
      <JsonLd
        data={buildServiceJsonLd({
          name: 'Dry Cleaning Pickup and Delivery',
          description:
            'Pressly dry cleaning pickup and delivery with per-item pricing, free pickup, and online scheduling.',
          path: '/services-pricing/dry-cleaning',
          areaName: 'New Jersey',
          serviceType: 'dryCleaning',
        })}
      />
      <section className="mx-auto max-w-[1440px] px-4 pt-12 pb-[88px] sm:px-6 lg:py-20">
        <ServiceHero
          title="Dry Cleaning"
          description={[
            "Dry Cleaning is the best option if you're exhausted of wasting time and energy doing laundry during your free time.",
            'Your laundry will be picked up, cleaned, and delivered by Pressly. Everything in your bag will be cleaned to your preferences by our laundry experts.',
            "There's always better things to do than laundry, let Pressly professionally take this tedious chore off your hands.",
          ]}
          imageSrc="/graphic-img/dry-cleaning.webp"
          imageAlt="Dry cleaning service"
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <ServicesHiw
          title="How a dry cleaning service works."
          steps={[
            {
              title: "We'll inspect and tag your garments",
              description:
                "We'll carefully check each item for stains and damages, then tag them for tracking throughout the cleaning process.",
              media: (
                <DryCleaningStepImage
                  src="/graphic-img/dc-1.png.webp"
                  alt="Dry cleaning garment inspection and tagging"
                />
              ),
            },
            {
              title: 'Your garments will be professionally cleaned',
              description:
                'Our expert cleaners will use specialized dry cleaning methods to safely clean your delicate and special garments.',
              media: (
                <DryCleaningStepImage
                  src="/graphic-img/dc-2.png.webp"
                  alt="Dry cleaning professional garment cleaning"
                />
              ),
            },
            {
              title: "We'll press and steam your clothes",
              description:
                'Each item will be professionally pressed and steamed to remove wrinkles and restore the original shape.',
              media: (
                <DryCleaningStepImage
                  src="/graphic-img/dc-3.png.webp"
                  alt="Dry cleaned garments being pressed and steamed"
                />
              ),
            },
            {
              title: 'Everything will be packaged and ready to wear',
              description:
                'Your garments will be carefully packaged on hangers with protective coverings, ready to hang in your closet.',
              media: (
                <DryCleaningStepImage
                  src="/graphic-img/dc-4.png.webp"
                  alt="Packaged dry cleaning ready to wear"
                />
              ),
            },
          ]}
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <DryCleaningPricing pricing={pricing} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <OtherServices
          title="Other Services"
          subtitle="Check out other dry cleaning services Pressly offers."
          services={[
            {
              title: 'Launder & Press',
              price: '$3.95',
              description:
                'Priced per item. Perfect for shirts you want laundered and pressed. Our cleaning experts will separate what is best for dry cleaning and launder-press.',
            },
          ]}
          imageSrc="/graphic-img/dc-other-services.webp"
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <DeliveryInfo
          description="Pressly's services are available 7-days a week, between 7pm-9pm. You may turn on contactless delivery when scheduling your first pickup or inside your account preferences."
          details={[
            {
              title: 'Free Delivery',
              price: '$0',
              description:
                'Yes! Delivery is always free for every dry cleaning order. You only pay for what you send to clean.',
            },
            {
              title: 'Minimum',
              price: formatUsdShortFromCents(minimumCents),
              description: `Minimum only applies to orders that total less than ${formatUsdShortFromCents(
                minimumCents,
              )}. This is not an extra charge on top of orders above ${formatUsdShortFromCents(
                minimumCents,
              )}.`,
            },
          ]}
          imageSrc="/graphic-img/dc-delivery.webp"
        />
      </section>

      <ServiceBottomSection
        title="Look Sharp Without the Extra Trip"
        description="We’ll pick up your dry cleaning, clean and press it with care, and bring it back looking fresh and ready to wear. It’s one less stop in your week and a little more time for the things that matter."
      />
    </>
  );
}
