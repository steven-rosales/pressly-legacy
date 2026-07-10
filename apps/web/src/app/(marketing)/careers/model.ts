import { CONTACT } from '@/config/site';

export type CareersPageModel = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}>;

export const getCareersPageModel = (): CareersPageModel => ({
  eyebrow: 'Careers',
  title: 'Help build Pressly.',
  description:
    'We are not listing open roles on the website yet. If you are interested in future operations, customer care, or local service roles, send a short note and we will keep it on file.',
  primaryHref: `mailto:${CONTACT.email}?subject=Careers at Pressly`,
  primaryLabel: 'Email Pressly',
  secondaryHref: '/about',
  secondaryLabel: 'About Pressly',
});
