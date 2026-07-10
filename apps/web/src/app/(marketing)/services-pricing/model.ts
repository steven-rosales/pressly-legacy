import {
  type DryCleaningPricingModel,
  type PricingCatalogLoader,
  type WashFoldPricingModel,
} from '@/features/pricing/model';
import {
  formatUsd,
  formatUsdShort,
  toDryCleaningPricingModel,
  toWashFoldPricingModel,
} from '@/features/pricing/presenter';
import { PRICING } from '@/features/pricing/static-catalog';
import { buildServicePricingPageJsonLd } from '@/app/_lib/seo';
import { formatQuantity } from './presenter';

export type ServicePricingSection = Readonly<{
  title: string;
  description: readonly string[];
  imageSrc: string;
  imageAlt: string;
}>;

export type ServiceHiwStepModel = Readonly<{
  title: string;
  description: string;
  image: Readonly<{
    src: string;
    alt: string;
  }>;
}>;

export type OtherServiceModel = Readonly<{
  title: string;
  price: string;
  description: string;
}>;

export type DeliveryDetailModel = Readonly<{
  title: string;
  price: string;
  description: string;
}>;

export type DeliveryInfoModel = Readonly<{
  description: string;
  details: readonly DeliveryDetailModel[];
  imageSrc: string;
}>;

export type ServicePricingPageModel = Readonly<{
  jsonLd: Record<string, unknown>;
  hero: ServicePricingSection;
  hiw: Readonly<{
    title: string;
    steps: readonly ServiceHiwStepModel[];
  }>;
  pricing:
    | Readonly<{ service: 'wash-fold'; model: WashFoldPricingModel }>
    | Readonly<{ service: 'dry-cleaning'; model: DryCleaningPricingModel }>;
  otherServices: Readonly<{
    title: string;
    subtitle: string;
    services: readonly OtherServiceModel[];
    imageSrc: string;
  }>;
  delivery: DeliveryInfoModel;
  bottom: Readonly<{
    title: string;
    description: string;
  }>;
}>;

export async function getWashFoldServicePricingPageModel(
  loadPricing: PricingCatalogLoader,
): Promise<ServicePricingPageModel> {
  const pricing = await loadPricing({
    serviceSlug: 'wash-fold',
  });
  const pricingModel = toWashFoldPricingModel(pricing.catalog);
  const minimumPrice =
    pricingModel.minimumPrice ?? formatUsdShort(PRICING.washFoldMinimumCents);
  const thresholdLbs =
    pricingModel.minimumThresholdQuantity ??
    PRICING.washFoldMinimumThresholdLbs;

  return {
    jsonLd: buildServicePricingPageJsonLd({
      name: 'Wash & Fold Laundry Service',
      description:
        'Pressly wash and fold laundry pickup and delivery with clear per-pound pricing, free delivery, and online scheduling.',
      path: '/services-pricing/wash-fold',
      areaName: 'New Jersey',
      serviceType: 'washFold',
      pricingCatalog: pricing.catalog,
      breadcrumbs: [
        { name: 'Home', path: '/' },
        {
          name: 'Wash & Fold Laundry Service',
          path: '/services-pricing/wash-fold',
        },
      ],
    }),
    hero: {
      title: 'Wash & Fold',
      description: [
        "Wash & Fold is the best option if you're exhausted of wasting time and energy doing laundry during your free time.",
        'Your laundry will be picked up, cleaned, and delivered by Pressly. Everything in your bag will be cleaned to your preferences by our laundry experts.',
        "There's always better things to do than laundry, let Pressly professionally take this tedious chore off your hands.",
      ],
      imageSrc: '/graphic-img/wash-fold.webp',
      imageAlt: 'Wash and fold laundry service',
    },
    hiw: {
      title: 'How a wash & fold service works.',
      steps: [
        {
          title: "We'll inspect and sort your clothing",
          description:
            "We'll check your pockets for any unwanted items and sort your darks and whites before washing.",
          image: {
            src: '/graphic-img/wf-1.png.webp',
            alt: 'Wash and fold laundry inspection and sorting',
          },
        },
        {
          title: 'Your clothes will be cleaned with your preferences',
          description:
            "Our launderers will clean your laundry with your preferences you've set up in your account.",
          image: {
            src: '/graphic-img/wf-2.png.webp',
            alt: 'Wash and fold laundry cleaned to preferences',
          },
        },
        {
          title: "We'll dry all your clothes in low setting",
          description:
            'We set the drying on a low temperature setting to avoid any tearing and / or shrinking.',
          image: {
            src: '/graphic-img/wf-3.png.webp',
            alt: 'Wash and fold laundry low heat drying',
          },
        },
        {
          title: 'Everything will be folded and ready to put away',
          description:
            "Your clothes will be professionally folded using Pressly's methods so it can be ready to put away when you receive it.",
          image: {
            src: '/graphic-img/wf-4.png.webp',
            alt: 'Folded wash and fold laundry ready to put away',
          },
        },
      ],
    },
    pricing: {
      service: 'wash-fold',
      model: pricingModel,
    },
    otherServices: {
      title: 'Other Services',
      subtitle: 'Check out other laundry services Pressly offers.',
      services: [
        {
          title: 'Hang Dry',
          price: pricingModel.hangDryPrice ?? formatUsd(PRICING.hangDryCents),
          description:
            'Priced per item. Perfect for everyday delicate items you want to have washed, hung to dry, and neatly folded.',
        },
      ],
      imageSrc: '/graphic-img/wf-other-services.webp',
    },
    delivery: {
      description:
        "Pressly's services are available 7-days a week, between 7pm-9pm. You may turn on contactless delivery when scheduling your first pickup or inside your account preferences.",
      details: [
        {
          title: pricingModel.deliveryFee.title,
          price: pricingModel.deliveryFee.price,
          description: pricingModel.deliveryFee.copy,
        },
        {
          title: 'Minimum',
          price: minimumPrice,
          description: `Minimum will be waived for orders above ${formatQuantity(
            thresholdLbs,
          )} lbs. For orders ${formatQuantity(
            thresholdLbs,
          )} lbs or lower, Pressly charges your per-pound laundry and any specialty items, then only adds a minimum adjustment if that subtotal is below ${minimumPrice}.`,
        },
      ],
      imageSrc: '/graphic-img/wf-delivery.webp',
    },
    bottom: {
      title: 'Enjoy Fresh Laundry Without the Work',
      description:
        'We get it, you’ve got plenty on your plate. Leave the laundry to us and enjoy a little more ease, a little more comfort, and a lot more free time.',
    },
  };
}

export async function getDryCleaningServicePricingPageModel(
  loadPricing: PricingCatalogLoader,
): Promise<ServicePricingPageModel> {
  const pricing = await loadPricing({
    serviceSlug: 'dry-cleaning',
  });
  const pricingModel = toDryCleaningPricingModel(pricing.catalog);
  const minimumPrice =
    pricingModel.minimumPrice ??
    formatUsdShort(PRICING.dryCleaningMinimumCents);

  return {
    jsonLd: buildServicePricingPageJsonLd({
      name: 'Dry Cleaning Pickup and Delivery',
      description:
        'Pressly dry cleaning pickup and delivery with per-item pricing, free delivery, and online scheduling.',
      path: '/services-pricing/dry-cleaning',
      areaName: 'New Jersey',
      serviceType: 'dryCleaning',
      pricingCatalog: pricing.catalog,
      breadcrumbs: [
        { name: 'Home', path: '/' },
        {
          name: 'Dry Cleaning Pickup and Delivery',
          path: '/services-pricing/dry-cleaning',
        },
      ],
    }),
    hero: {
      title: 'Dry Cleaning',
      description: [
        "Dry Cleaning is the best option if you're exhausted of wasting time and energy doing laundry during your free time.",
        'Your laundry will be picked up, cleaned, and delivered by Pressly. Everything in your bag will be cleaned to your preferences by our laundry experts.',
        "There's always better things to do than laundry, let Pressly professionally take this tedious chore off your hands.",
      ],
      imageSrc: '/graphic-img/dry-cleaning.webp',
      imageAlt: 'Dry cleaning service',
    },
    hiw: {
      title: 'How a dry cleaning service works.',
      steps: [
        {
          title: "We'll inspect and tag your garments",
          description:
            "We'll carefully check each item for stains and damages, then tag them for tracking throughout the cleaning process.",
          image: {
            src: '/graphic-img/dc-1.png.webp',
            alt: 'Dry cleaning garment inspection and tagging',
          },
        },
        {
          title: 'Your garments will be professionally cleaned',
          description:
            'Our expert cleaners will use specialized dry cleaning methods to safely clean your delicate and special garments.',
          image: {
            src: '/graphic-img/dc-2.png.webp',
            alt: 'Dry cleaning professional garment cleaning',
          },
        },
        {
          title: "We'll press and steam your clothes",
          description:
            'Each item will be professionally pressed and steamed to remove wrinkles and restore the original shape.',
          image: {
            src: '/graphic-img/dc-3.png.webp',
            alt: 'Dry cleaned garments being pressed and steamed',
          },
        },
        {
          title: 'Everything will be packaged and ready to wear',
          description:
            'Your garments will be carefully packaged on hangers with protective coverings, ready to hang in your closet.',
          image: {
            src: '/graphic-img/dc-4.png.webp',
            alt: 'Packaged dry cleaning ready to wear',
          },
        },
      ],
    },
    pricing: {
      service: 'dry-cleaning',
      model: pricingModel,
    },
    otherServices: {
      title: 'Other Services',
      subtitle: 'Check out other dry cleaning services Pressly offers.',
      services: [
        {
          title: 'Launder & Press',
          price:
            pricingModel.launderPressPrice ??
            formatUsd(PRICING.launderPressCents),
          description:
            'Priced per item. Perfect for shirts you want laundered and pressed. Our cleaning experts will separate what is best for dry cleaning and launder-press.',
        },
      ],
      imageSrc: '/graphic-img/dc-other-services.webp',
    },
    delivery: {
      description:
        "Pressly's services are available 7-days a week, between 7pm-9pm. You may turn on contactless delivery when scheduling your first pickup or inside your account preferences.",
      details: [
        {
          title: pricingModel.deliveryFee.title,
          price: pricingModel.deliveryFee.price,
          description: pricingModel.deliveryFee.copy,
        },
        {
          title: 'Minimum',
          price: minimumPrice,
          description: `Minimum only applies to orders that total less than ${minimumPrice}. This is not an extra charge on top of orders above ${minimumPrice}.`,
        },
      ],
      imageSrc: '/graphic-img/dc-delivery.webp',
    },
    bottom: {
      title: 'Look Sharp Without the Extra Trip',
      description:
        'We’ll pick up your dry cleaning, clean and press it with care, and bring it back looking fresh and ready to wear. It’s one less stop in your week and a little more time for the things that matter.',
    },
  };
}
