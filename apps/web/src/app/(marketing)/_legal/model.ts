import { CONTACT } from '@/config/site';

export type LegalDocumentModel = Readonly<{
  title: string;
  updatedLabel: string;
  sections: readonly Readonly<{
    title: string;
    paragraphs?: readonly string[];
    bullets?: readonly string[];
    contact?: Readonly<{
      intro: string;
      email: string;
      phone: string;
      phoneHref: string;
    }>;
  }>[];
}>;

export const getPrivacyPolicyModel = (): LegalDocumentModel => ({
  title: 'Privacy Policy',
  updatedLabel: 'January 2025',
  sections: [
    {
      title: 'Information We Collect',
      paragraphs: [
        'We collect information you provide directly to us, including:',
      ],
      bullets: [
        'Name, email address, phone number, and delivery address when you create an account',
        'Payment information when you make a purchase',
        'Communications you send to us, such as customer service inquiries',
        'Order preferences and cleaning instructions',
      ],
    },
    {
      title: 'How We Use Your Information',
      paragraphs: ['We use the information we collect to:'],
      bullets: [
        'Process and fulfill your laundry and dry cleaning orders',
        'Send you order confirmations, pickup and delivery notifications via SMS and email',
        'Respond to your comments, questions, and requests',
        'Improve our services and develop new features',
      ],
    },
    {
      title: 'Information Sharing',
      paragraphs: [
        'We do not sell, trade, or rent your personal information to third parties. We may share your information with service providers who assist us in operating our business, such as payment processors and delivery partners. These providers are contractually obligated to protect your information.',
      ],
    },
    {
      title: 'Data Security',
      paragraphs: [
        'We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet is 100% secure.',
      ],
    },
    {
      title: 'Your Rights',
      paragraphs: [
        'You may access, update, or delete your account information at any time by logging into your account or contacting us. You may opt out of receiving promotional communications by following the unsubscribe instructions in those messages or by replying STOP to any SMS message.',
      ],
    },
    {
      title: 'Contact Us',
      contact: {
        intro:
          'If you have any questions about this Privacy Policy, please contact us at',
        email: CONTACT.email,
        phone: CONTACT.phone,
        phoneHref: CONTACT.phoneHref,
      },
    },
  ],
});

export const getTermsOfServiceModel = (): LegalDocumentModel => ({
  title: 'Terms of Service',
  updatedLabel: 'January 2025',
  sections: [
    {
      title: 'Acceptance of Terms',
      paragraphs: [
        "By accessing or using Pressly's services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.",
      ],
    },
    {
      title: 'Service Description',
      paragraphs: [
        'Pressly provides laundry pickup, wash and fold, and dry cleaning services. We pick up your items from your specified location, clean them according to your preferences, and deliver them back to you. Service availability varies by location.',
      ],
    },
    {
      title: 'User Responsibilities',
      paragraphs: ['When using our services, you agree to:'],
      bullets: [
        'Provide accurate account and contact information',
        'Ensure items are ready for pickup at the scheduled time',
        'Remove all personal items from pockets before pickup',
        'Inform us of any special care instructions or delicate items',
        'Report any issues with your order within 24 hours of delivery',
      ],
    },
    {
      title: 'Payment Terms',
      paragraphs: [
        'Payment is processed after your items are weighed or counted. You authorize us to charge your payment method on file for all services rendered. Prices are subject to change, and you will be notified of any price changes before your next order.',
      ],
    },
    {
      title: 'Limitation of Liability',
      paragraphs: [
        "While we take great care with your items, Pressly's liability for lost or damaged items is limited to ten times the cleaning cost of the affected item, up to a maximum of $200 per item. We are not responsible for items left in pockets, pre-existing damage, or damage caused by normal wear and cleaning processes.",
      ],
    },
    {
      title: 'Changes to Terms',
      paragraphs: [
        'We may update these Terms of Service from time to time. We will notify you of any material changes by posting the new terms on our website. Your continued use of our services after such changes constitutes acceptance of the updated terms.',
      ],
    },
    {
      title: 'Contact Us',
      contact: {
        intro:
          'If you have any questions about these Terms of Service, please contact us at',
        email: CONTACT.email,
        phone: CONTACT.phone,
        phoneHref: CONTACT.phoneHref,
      },
    },
  ],
});
