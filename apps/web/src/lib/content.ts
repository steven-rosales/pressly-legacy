export const SITE_URL = 'https://trypressly.com';
export const CENTS_ORDER_URL = 'https://app.trycents.com/order/business/OGgz';

export const CONTACT = {
  email: 'care@trypressly.com',
  phone: '(862) 310-6447',
  phoneHref: 'tel:8623106447',
} as const;

export const OFFER_COPY =
  'Free pickup & delivery and $20 off automatically applied.';

export const PRICING = {
  washFoldPerLbCents: 167,
  washFoldMinimumCents: 3000,
  washFoldMinimumThresholdLbs: 18,
  dryCleaningMinimumCents: 3000,
  hangDryCents: 295,
  launderPressCents: 395,
} as const;

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export type ServiceKind = 'washFold' | 'dryCleaning';

export interface ServiceConfig {
  kind: ServiceKind;
  label: string;
  navLabel: string;
  citySlugPrefix: string;
  pricingHref: string;
  heroImage: string;
  imageAlt: string;
  pageTitle: string;
  metaDescription: string;
  cityTitleSuffix: string;
  cityMetaNoun: string;
  intro: readonly [string, string, string];
  bullets: readonly [string, string, string, string];
}

export const SERVICE_KINDS = ['washFold', 'dryCleaning'] as const;

export const SERVICE_CONFIGS: Record<ServiceKind, ServiceConfig> = {
  washFold: {
    kind: 'washFold',
    label: 'Wash & Fold',
    navLabel: 'Wash & Fold',
    citySlugPrefix: 'laundry-service-in-',
    pricingHref: '/services-pricing/wash-fold',
    heroImage: '/graphic-img/wash-fold.webp',
    imageAlt: 'Folded laundry ready for delivery.',
    pageTitle: 'Wash & Fold Laundry Service',
    metaDescription:
      'Professional wash and fold laundry service with pickup and delivery.',
    cityTitleSuffix: 'Wash & Fold Laundry Service',
    cityMetaNoun: 'wash and fold laundry service',
    intro: [
      'Perfect for clothes that need to be washed, dried, and crisply folded. Put your clothes in any bag available to you.',
      'We inspect pockets, sort lights and darks, wash with your preferences, and dry clothing on a low setting.',
      'Your cleaning and delivery preferences can be updated while scheduling through Pressly powered by Cents.',
    ],
    bullets: [
      'Cleaned to your preferences',
      'Professional folding',
      'Next-day turnaround when available',
      'Free pickup and delivery',
    ],
  },
  dryCleaning: {
    kind: 'dryCleaning',
    label: 'Dry Cleaning',
    navLabel: 'Dry Cleaning',
    citySlugPrefix: 'dry-cleaners-in-',
    pricingHref: '/services-pricing/dry-cleaning',
    heroImage: '/graphic-img/dry-cleaning.webp',
    imageAlt: 'Dry cleaned shirts hanging after service.',
    pageTitle: 'Dry Cleaning Delivery Service',
    metaDescription:
      'Professional dry cleaning service with convenient pickup and delivery.',
    cityTitleSuffix: 'Dry Cleaning Delivery Service',
    cityMetaNoun: 'dry cleaning delivery service',
    intro: [
      'Your dry cleaning is cleaned, pressed, hung, and prepared so it is ready to wear.',
      'Garments are handled with professional care from pickup through delivery.',
      'Add dry cleaning to the same pickup as your laundry and manage the order through Pressly powered by Cents.',
    ],
    bullets: [
      'Pressed and ready to wear',
      'Shirts, suits, dresses, coats, and household items',
      'Pickup and delivery in one order',
      'Free pickup and delivery',
    ],
  },
};

export const HOW_IT_WORKS = [
  {
    title: 'Schedule',
    description:
      'Choose pickup, delivery, and cleaning preferences through the Cents ordering flow.',
    image: '/graphic-img/1-how-it-works.webp',
  },
  {
    title: 'Pickup',
    description:
      'Leave your laundry or dry cleaning ready during the pickup window. Delivery is free.',
    image: '/graphic-img/2-how-it-works.webp',
  },
  {
    title: 'Clean & Deliver',
    description:
      'Your order is cleaned, folded or pressed, and returned fresh to your door.',
    image: '/graphic-img/3-how-it-works.webp',
  },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      'Pickup was simple, delivery was right on time, and the clothes came back folded better than I ever do it.',
    name: 'Maya R.',
    location: 'Bergen County',
  },
  {
    quote:
      'Pressly took dry cleaning off my errand list. I scheduled once and everything came back ready for the week.',
    name: 'Anthony P.',
    location: 'Hudson County',
  },
  {
    quote:
      'Clear pricing, easy pickup, and no extra trip across town. That is exactly what I needed.',
    name: 'Sarah L.',
    location: 'Essex County',
  },
] as const;

export const WASH_FOLD_SPECIALTY_ITEMS = [
  { name: 'Small Comforter', price: '$9.95' },
  { name: 'Large Comforter', price: '$19.95' },
  { name: 'Duvet', price: '$14.95' },
  { name: 'Bathmat', price: '$5.95' },
] as const;

export const DRY_CLEANING_PRICING = [
  {
    title: 'Tops',
    items: [
      { name: 'Shirts', price: '$4.95' },
      { name: 'Polo', price: '$4.95' },
      { name: 'Blouse', price: '$7.95' },
      { name: 'Sweater', price: '$8.50' },
      { name: 'Vest', price: '$8.50' },
      { name: 'Blazer / Jacket', price: '$9.95' },
    ],
  },
  {
    title: 'Bottoms',
    items: [
      { name: 'Shorts', price: '$6.95' },
      { name: 'Skirt', price: '$6.95' },
      { name: 'Pants', price: '$8.95' },
    ],
  },
  {
    title: 'Full Body',
    items: [
      { name: 'Casual Dress', price: '$9.50' },
      { name: 'Coat', price: '$17.95' },
      { name: 'Suit - Full Piece', price: '$18.90' },
      { name: 'Formal Dress', price: '$25.90' },
    ],
  },
  {
    title: 'Household',
    items: [
      { name: 'Rugs', price: '$3.25 /sqft' },
      { name: 'Sheet / Blanket', price: '$12.95' },
      { name: 'Tablecloth', price: '$18.95' },
      { name: 'Curtain', price: '$37.95' },
      { name: 'Comforter', price: '$39.95' },
    ],
  },
  {
    title: 'Accessories',
    items: [
      { name: 'Napkin', price: '$1.95' },
      { name: 'Scarf', price: '$5.95' },
      { name: 'Tie', price: '$6.95' },
    ],
  },
] as const;
