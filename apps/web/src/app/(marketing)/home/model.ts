import { OFFER_COPY } from '@/app/shared/marketing/content';

export type HomeFeature = Readonly<{ title: string }>;

export type HomeImage = Readonly<{
  src: string;
  alt: string;
}>;

export type HomeServiceSectionModel = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  featuresTitle: string;
  features: readonly HomeFeature[];
  ctaSource: 'home_wash_fold' | 'home_dry_cleaning';
  offerText: string;
  image: HomeImage;
}>;

export type HomePageModel = Readonly<{
  hero: Readonly<{
    eyebrow?: string;
    title: string;
    description: string;
    primaryCtaSource: 'home_hero';
    secondaryHref: string;
    secondaryLabel: string;
    image: HomeImage;
  }>;
  hiw: Readonly<{
    eyebrow: string;
    title: string;
    steps: readonly Readonly<{
      title: string;
      description: string;
      image: HomeImage;
    }>[];
  }>;
  washFold: HomeServiceSectionModel;
  dryCleaning: HomeServiceSectionModel;
  testimonials: Readonly<{
    eyebrow: string;
    title: string;
    items: readonly Readonly<{
      name: string;
      verified: boolean;
      source: string;
      rating: number;
      review: string;
    }>[];
  }>;
  bottom: Readonly<{
    eyebrow: string;
    title: string;
    paragraphs: readonly string[];
    primaryCtaSource: 'home_mid_page';
    secondaryHref: string;
    secondaryLabel: string;
    image: HomeImage;
  }>;
}>;

export const getHomePageModel = (): HomePageModel => ({
  hero: {
    title: 'New Jersey Laundry Service & Dry Cleaning',
    description:
      'Pressly picks up, cleans, and delivers your laundry and dry cleaning. Quickest pickup & delivery in the area!',
    primaryCtaSource: 'home_hero',
    secondaryHref: '/services-pricing/wash-fold',
    secondaryLabel: 'Services & Pricing',
    image: {
      src: '/graphic-img/hero-customer.webp',
      alt: 'Laundry Customer leaving laundry outside for pickup.',
    },
  },
  hiw: {
    eyebrow: 'How It Works',
    title: 'A solution for everything in your wardrobe.',
    steps: [
      {
        title: 'Your driver will pickup between 6:30pm-9:30pm',
        description:
          'Enjoy the convenience of our 7-day-a-week pickup and delivery service.',
        image: {
          src: '/graphic-img/1-how-it-works.webp',
          alt: 'Schedule pickup on mobile device',
        },
      },
      {
        title: 'Industry experts will carefully clean everything',
        description:
          'Professionals with decades of experience handle all your laundry and dry cleaning.',
        image: {
          src: '/graphic-img/2-how-it-works.webp',
          alt: 'Professional cleaning equipment',
        },
      },
      {
        title: 'Enjoy always having clean clothes at your fingertips',
        description:
          "With our quick turnarounds you'll always find a clean closet—and a clean peace of mind.",
        image: {
          src: '/graphic-img/3-how-it-works.webp',
          alt: 'Clean laundry delivered to your door',
        },
      },
    ],
  },
  washFold: {
    eyebrow: 'Wash & Fold',
    title: 'Clean Laundry at Your Fingertips',
    description:
      'Life’s busy enough already. Let us take the laundry off your hands so you can enjoy a little more breathing room, a little more calm, and a lot more time for yourself.',
    featuresTitle: 'Service Features',
    features: [
      { title: 'Scented Or Free & Clear' },
      { title: 'Careful Low-Heat Drying' },
      { title: 'Neatly Folded & Bagged' },
      { title: 'Fast 1 Day Turnaround' },
    ],
    ctaSource: 'home_wash_fold',
    offerText: OFFER_COPY,
    image: {
      src: '/graphic-img/wash-fold.webp',
      alt: 'Wash and fold laundry service',
    },
  },
  dryCleaning: {
    eyebrow: 'Dry Cleaning',
    title: 'Skip the Trips to the Dry Cleaner',
    description:
      "Life moves fast, and dropping off dry cleaning shouldn't slow you down. We pick it up, clean it with care, and bring it back looking sharp—so you always feel ready for whatever's next.",
    featuresTitle: 'Service Features',
    features: [
      { title: 'Gentle, Fabric-Safe Cleaning' },
      { title: 'Crisp Pressing & Finishing' },
      { title: 'Stain Treatment Included' },
      { title: 'Convenient Pickup & Delivery' },
    ],
    ctaSource: 'home_dry_cleaning',
    offerText: OFFER_COPY,
    image: {
      src: '/graphic-img/dry-cleaning.webp',
      alt: 'Dry cleaning service',
    },
  },
  testimonials: {
    eyebrow: 'Testimonials',
    title: 'What Our Customers Say',
    items: [
      {
        name: 'Shaunta J.',
        verified: true,
        source: 'on Google',
        rating: 5,
        review:
          'Laundry service is top notch! They pick up and deliver. It is a completely seamless process! I will continue to use their services.',
      },
      {
        name: 'Carla R.',
        verified: true,
        source: 'on Google',
        rating: 5,
        review:
          'I get my laundry picked up and delivered hassle free. My Laundry is picked up within a 2 hour window and delivered the very next day. The laundry comes back superb. Washed well, whites come back whiter, smelling great and folded prestige. I will be a forever be a customer.',
      },
      {
        name: 'Joe S.',
        verified: false,
        source: 'on Google',
        rating: 5,
        review:
          'I have been using this laundry service for over a year now, and I can confidently say that they have been nothing but a blessing. I highly recommend this service to anyone looking for laundry services.',
      },
    ],
  },
  bottom: {
    eyebrow: 'Conquer Your Time',
    title: 'Skip the Hassle of Laundry Day',
    paragraphs: [
      'Pressly has now saved 10+ years of customer time.',
      'Join thousands of people in having a laundry-free life. Schedule a same-day pickup and get it back the very next day!',
    ],
    primaryCtaSource: 'home_mid_page',
    secondaryHref: '/services-pricing/wash-fold',
    secondaryLabel: 'Services & Pricing',
    image: {
      src: '/graphic-img/conquer-time.webp',
      alt: 'Conquer your time with Pressly laundry service',
    },
  },
});
