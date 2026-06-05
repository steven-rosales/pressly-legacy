import Image from 'next/image';
import type { HomePageModel } from '../model';

export default function HowItWorks({ model }: { model: HomePageModel['hiw'] }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
        {model.eyebrow}
      </p>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-12 sm:mb-16 lg:mb-20 max-w-4xl">
        {model.title}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 w-full">
        {model.steps.map((step) => (
          <div key={step.title} className="flex flex-col items-center">
            <div className="relative w-full max-w-[220px] aspect-square mb-6 lg:mb-8">
              <Image
                src={step.image.src}
                alt={step.image.alt}
                fill
                sizes="220px"
                className="object-contain"
              />
            </div>
            <h3 className="text-xl sm:text-2xl font-medium mb-3 lg:mb-4 max-w-xs">
              {step.title}
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground max-w-sm leading-relaxed">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
