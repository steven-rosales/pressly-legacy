import { CONTACT, DELIVERY_FEE_COPY } from '@/app/shared/marketing/content';
import { buildFaqJsonLd } from '@/app/shared/marketing/seo';

export type FaqsPageModel = Readonly<{
  jsonLd: Record<string, unknown>;
  eyebrow: string;
  title: string;
  description: string;
  faqs: readonly Readonly<{ question: string; answer: string }>[];
  ctaSource: 'faq';
}>;

const faqs = [
  {
    question: 'How do I schedule a pickup?',
    answer:
      'Use the schedule page, enter your pickup details, choose your services, and place the order through the Cents ordering flow.',
  },
  {
    question: 'Can I order wash and fold and dry cleaning together?',
    answer:
      'Yes. Add both services to the same pickup and keep the items separated in bags when possible.',
  },
  {
    question: 'What should I put my laundry in?',
    answer:
      'Use any bag you have available. If you are sending dry cleaning too, separate those garments from wash and fold laundry.',
  },
  {
    question: 'What is the pickup and delivery fee?',
    answer: `${DELIVERY_FEE_COPY} Order minimums and item pricing still apply.`,
  },
  {
    question: 'When will my order come back?',
    answer:
      'Most wash and fold orders return next day when available. Dry cleaning timing depends on the garments and selected services.',
  },
  {
    question: 'Who do I contact for support?',
    answer: `Contact Pressly customer care at ${CONTACT.email} or ${CONTACT.phone}.`,
  },
] as const;

export const getFaqsPageModel = (): FaqsPageModel => ({
  jsonLd: buildFaqJsonLd(faqs),
  eyebrow: 'FAQs',
  title: 'Common pickup questions.',
  description:
    'The ordering flow handles the final pickup details, but these notes cover the basics before you begin.',
  faqs,
  ctaSource: 'faq',
});
