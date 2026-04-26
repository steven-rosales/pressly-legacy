import { LegalDocumentPage } from '@/routes/shared/public/LegalDocumentPage';

export default function TermsOfServiceRoute() {
  return (
    <LegalDocumentPage title="Terms of Service" updatedLabel="January 2025">
      <div>
        <h2 className="mb-3 text-xl font-semibold">Acceptance of Terms</h2>
        <p className="text-muted-foreground">
          By accessing or using Pressly&apos;s services, you agree to be bound
          by these Terms of Service. If you do not agree to these terms, please
          do not use our services.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Service Description</h2>
        <p className="text-muted-foreground">
          Pressly provides laundry pickup, wash and fold, and dry cleaning
          services. We pick up your items from your specified location, clean
          them according to your preferences, and deliver them back to you.
          Service availability varies by location.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">User Responsibilities</h2>
        <p className="mb-3 text-muted-foreground">
          When using our services, you agree to:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>Provide accurate account and contact information</li>
          <li>Ensure items are ready for pickup at the scheduled time</li>
          <li>Remove all personal items from pockets before pickup</li>
          <li>Inform us of any special care instructions or delicate items</li>
          <li>Report any issues with your order within 24 hours of delivery</li>
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Payment Terms</h2>
        <p className="text-muted-foreground">
          Payment is processed after your items are weighed or counted. You
          authorize us to charge your payment method on file for all services
          rendered. Prices are subject to change, and you will be notified of
          any price changes before your next order.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Limitation of Liability</h2>
        <p className="text-muted-foreground">
          While we take great care with your items, Pressly&apos;s liability for
          lost or damaged items is limited to ten times the cleaning cost of the
          affected item, up to a maximum of $200 per item. We are not
          responsible for items left in pockets, pre-existing damage, or damage
          caused by normal wear and cleaning processes.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Changes to Terms</h2>
        <p className="text-muted-foreground">
          We may update these Terms of Service from time to time. We will notify
          you of any material changes by posting the new terms on our website.
          Your continued use of our services after such changes constitutes
          acceptance of the updated terms.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xl font-semibold">Contact Us</h2>
        <p className="text-muted-foreground">
          If you have any questions about these Terms of Service, please contact
          us at{' '}
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
