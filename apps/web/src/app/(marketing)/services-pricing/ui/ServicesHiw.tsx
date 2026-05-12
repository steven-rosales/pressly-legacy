import {
  HiwTimeline,
  type HiwTimelineStep,
} from '@/app/(marketing)/shared/ui/public/HiwTimeline';

interface ServicesHiwProps {
  title: string;
  steps: HiwTimelineStep[];
}

export default function ServicesHiw({ title, steps }: ServicesHiwProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <h2 className="text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <HiwTimeline steps={steps} />
    </div>
  );
}
