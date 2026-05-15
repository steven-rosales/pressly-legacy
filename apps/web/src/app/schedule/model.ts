import {
  CENTS_ORDER_URL,
  DRY_CLEANING_PRICING,
  PRICING,
  formatUsd,
} from '@/app/shared/marketing/content';

export type SchedulePageModel = Readonly<{
  orderUrl: string;
  pricing: Readonly<{
    washFold: readonly Readonly<{ label: string; value: string }>[];
    dryCleaning: Readonly<{
      description: string;
      previewItems: readonly Readonly<{ name: string; price: string }>[];
    }>;
  }>;
  faqs: readonly Readonly<{
    question: string;
    answer: string;
  }>[];
}>;

export const getSchedulePageModel = (): SchedulePageModel => ({
  orderUrl: CENTS_ORDER_URL,
  pricing: {
    washFold: [
      {
        label: 'Per pound',
        value: `${formatUsd(PRICING.washFoldPerLbCents)} / lb`,
      },
      {
        label: 'Minimum',
        value: formatUsd(PRICING.washFoldMinimumCents),
      },
      {
        label: 'Hang dry',
        value: `${formatUsd(PRICING.hangDryCents)} / item`,
      },
    ],
    dryCleaning: {
      description: `Prices vary by garment. The dry cleaning minimum is ${formatUsd(
        PRICING.dryCleaningMinimumCents,
      )}.`,
      previewItems: DRY_CLEANING_PRICING.flatMap((group) =>
        group.items.map((item) => ({ name: item.name, price: item.price })),
      ).slice(0, 4),
    },
  },
  faqs: [
    {
      question: 'What should I have ready?',
      answer:
        'Place laundry or garments in any bag you have available. You can separate wash and fold from dry cleaning if you are ordering both.',
    },
    {
      question: 'Can I schedule laundry and dry cleaning together?',
      answer:
        'Yes. Add both services inside the ordering flow and choose the pickup window that works for you.',
    },
    {
      question: 'When do orders come back?',
      answer:
        'Most wash and fold orders return next day when available. Dry cleaning timing depends on the garments and selected service.',
    },
    {
      question: 'How do I get help with an order?',
      answer:
        'Use the order flow for order details, or contact Pressly customer care at care@trypressly.com.',
    },
  ],
});
