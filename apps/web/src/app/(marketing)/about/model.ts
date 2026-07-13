import { CONTACT } from '@/config/site';

export type AboutPageModel = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  primaryCtaSource: 'about';
  secondaryHref: string;
  secondaryLabel: string;
  values: readonly Readonly<{ title: string; description: string }>[];
  help: Readonly<{
    title: string;
    descriptionPrefix: string;
    phone: string;
    phoneHref: string;
    email: string;
  }>;
}>;

export const getAboutPageModel = (): AboutPageModel => ({
  eyebrow: 'About Pressly',
  title: 'Laundry and dry cleaning built around pickup and delivery.',
  description:
    'Pressly helps households and local businesses handle wash and fold, dry cleaning, and garment care without adding another errand to the week. Customers schedule online, prepare their items for pickup, and get clean laundry or pressed garments delivered back.',
  primaryCtaSource: 'about',
  secondaryHref: '/services-pricing/wash-fold',
  secondaryLabel: 'Services & Pricing',
  values: [
    {
      title: 'Convenience without shortcuts',
      description:
        'Pickup, cleaning, and delivery should feel simple without making garment care feel careless.',
    },
    {
      title: 'Clear service expectations',
      description:
        'Customers should understand pricing, turnaround, and what to prepare before an order is placed.',
    },
    {
      title: 'Care close to home',
      description:
        'Pressly is focused on dependable laundry and dry cleaning service across New Jersey communities.',
    },
  ],
  help: {
    title: 'Need help?',
    descriptionPrefix: 'Customer care is available daily from 1pm to 10pm at',
    phone: CONTACT.phone,
    phoneHref: CONTACT.phoneHref,
    email: CONTACT.email,
  },
});
