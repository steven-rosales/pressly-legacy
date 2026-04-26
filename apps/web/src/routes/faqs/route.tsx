import { PublicSiteShell } from '@/routes/shared/public/PublicSiteShell';
import PrimaryButton from '@/common/ui/primitives/PrimaryButton';
import { CONTACT } from '@/lib/content';

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
    question: 'Is pickup and delivery free?',
    answer:
      'Pickup and delivery are free for standard Pressly service areas. Order minimums and item pricing still apply.',
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

export default function FaqsRoute() {
  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            FAQs
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Common pickup questions.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            The ordering flow handles the final pickup details, but these notes
            cover the basics before you begin.
          </p>
        </div>

        <div className="mt-10 divide-y divide-border rounded-lg border">
          {faqs.map((item) => (
            <article key={item.question} className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">{item.question}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                {item.answer}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10">
          <PrimaryButton href="/schedule">Schedule a Pickup</PrimaryButton>
        </div>
      </section>
    </PublicSiteShell>
  );
}
