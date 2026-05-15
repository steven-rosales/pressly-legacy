import { JsonLd } from '@/app/shared/marketing/JsonLd';
import SchedulePickupButton from '@/app/shared/ui/components/SchedulePickupButton';
import type { FaqsPageModel } from '../model';

export function FaqsPageView({ model }: { model: FaqsPageModel }) {
  return (
    <>
      <JsonLd data={model.jsonLd} />
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {model.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {model.title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            {model.description}
          </p>
        </div>

        <div className="mt-10 divide-y divide-border rounded-lg border">
          {model.faqs.map((item) => (
            <article key={item.question} className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">{item.question}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                {item.answer}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10">
          <SchedulePickupButton source={model.ctaSource}>
            Schedule a Pickup
          </SchedulePickupButton>
        </div>
      </section>
    </>
  );
}
