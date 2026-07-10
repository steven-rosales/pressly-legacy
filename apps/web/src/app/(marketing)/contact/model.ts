import { CONTACT } from '@/config/site';

export type ContactPageModel = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  cards: readonly Readonly<{
    method: 'phone' | 'email';
    title: string;
    href: string;
    value: string;
    note: string;
  }>[];
  primaryCtaSource: 'contact';
  secondaryHref: string;
  secondaryLabel: string;
}>;

export const getContactPageModel = (): ContactPageModel => ({
  eyebrow: 'Contact',
  title: 'Pressly customer care.',
  description:
    'For order questions, pickup details, commercial service, or general support, reach out directly.',
  cards: [
    {
      method: 'phone',
      title: 'Phone',
      href: CONTACT.phoneHref,
      value: CONTACT.phone,
      note: 'Mon-Sun | 1pm - 10pm',
    },
    {
      method: 'email',
      title: 'Email',
      href: `mailto:${CONTACT.email}`,
      value: CONTACT.email,
      note: 'Best for order changes and service questions.',
    },
  ],
  primaryCtaSource: 'contact',
  secondaryHref: '/commercial',
  secondaryLabel: 'Commercial Service',
});
