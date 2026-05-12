import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/(marketing)/shared/marketing/seo';
import { LegalDocumentPage } from '@/app/(marketing)/shared/ui/public/LegalDocumentPage';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'Read the Pressly privacy policy for laundry and dry cleaning pickup and delivery customers.',
  path: '/privacy',
});

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage title="Privacy Policy" updatedLabel="January 2025">
      <div>
        <h2 className="mb-3 text-xl font-semibold">Information We Collect</h2>
        <p className="mb-3 text-muted-foreground">
          We collect information you provide directly to us, including:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            Name, email address, phone number, and delivery address when you
            create an account
          </li>
          <li>Payment information when you make a purchase</li>
          <li>
            Communications you send to us, such as customer service inquiries
          </li>
          <li>Order preferences and cleaning instructions</li>
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">
          How We Use Your Information
        </h2>
        <p className="mb-3 text-muted-foreground">
          We use the information we collect to:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>Process and fulfill your laundry and dry cleaning orders</li>
          <li>
            Send you order confirmations, pickup and delivery notifications via
            SMS and email
          </li>
          <li>Respond to your comments, questions, and requests</li>
          <li>Improve our services and develop new features</li>
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Information Sharing</h2>
        <p className="text-muted-foreground">
          We do not sell, trade, or rent your personal information to third
          parties. We may share your information with service providers who
          assist us in operating our business, such as payment processors and
          delivery partners. These providers are contractually obligated to
          protect your information.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Data Security</h2>
        <p className="text-muted-foreground">
          We implement appropriate technical and organizational measures to
          protect your personal information against unauthorized access,
          alteration, disclosure, or destruction. However, no method of
          transmission over the Internet is 100% secure.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Your Rights</h2>
        <p className="text-muted-foreground">
          You may access, update, or delete your account information at any time
          by logging into your account or contacting us. You may opt out of
          receiving promotional communications by following the unsubscribe
          instructions in those messages or by replying STOP to any SMS message.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Contact Us</h2>
        <p className="text-muted-foreground">
          If you have any questions about this Privacy Policy, please contact us
          at{' '}
          <a
            href="mailto:care@trypressly.com"
            className="text-primary underline underline-offset-4"
          >
            care@trypressly.com
          </a>{' '}
          or call us at{' '}
          <a
            href="tel:8623106447"
            className="text-primary underline underline-offset-4"
          >
            (862) 310-6447
          </a>
          .
        </p>
      </div>
    </LegalDocumentPage>
  );
}
