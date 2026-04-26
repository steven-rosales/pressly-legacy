import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQs',
  description: 'Answers to common Pressly pickup and delivery questions.',
};

export { default } from '@/routes/faqs/route';
