import Image from 'next/image';
import {
  HiwTimeline,
  type HiwTimelineStep,
} from '#customer/app/(marketing)/_components/HiwTimeline';
import type { ServiceHiwStepModel } from '../model';

interface ServicesHiwProps {
  title: string;
  steps: readonly ServiceHiwStepModel[];
}

function ServiceStepImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-square w-full max-w-[108px] overflow-hidden sm:max-w-[150px] lg:max-w-[200px]">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-contain"
        sizes="(max-width: 640px) 120px, (max-width: 1024px) 160px, 200px"
      />
    </div>
  );
}

export default function ServicesHiw({ title, steps }: ServicesHiwProps) {
  const timelineSteps: HiwTimelineStep[] = steps.map((step) => ({
    title: step.title,
    description: step.description,
    media: <ServiceStepImage src={step.image.src} alt={step.image.alt} />,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <h2 className="text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <HiwTimeline steps={timelineSteps} />
    </div>
  );
}
