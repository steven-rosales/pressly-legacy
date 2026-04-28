import { buildPageMetadata } from '@/routes/shared/marketing/seo';

export const metadata = buildPageMetadata({
  title: 'FAQs',
  description: 'Answers to common Pressly pickup and delivery questions.',
  path: '/faqs',
});

export { default } from '@/routes/faqs/route';
