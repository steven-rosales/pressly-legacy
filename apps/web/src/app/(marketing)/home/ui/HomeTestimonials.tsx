'use client';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/app/shared/ui/shadcn/carousel';
import type { HomePageModel } from '../model';

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`size-6 ${i < rating ? 'fill-orange-400 text-orange-400' : 'fill-muted text-muted'}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="0"
        >
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </div>
  );
}

function VerifiedBadge() {
  return (
    <svg
      className="inline size-5 fill-blue-500 text-white"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

export default function HomeTestimonials({
  model,
}: {
  model: HomePageModel['testimonials'];
}) {
  return (
    <div className="flex flex-col items-center text-center w-full">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
        {model.eyebrow}
      </p>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-12 sm:mb-16 lg:mb-20 max-w-4xl">
        {model.title}
      </h2>

      <Carousel
        opts={{
          align: 'start',
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {model.items.map((testimonial) => (
            <CarouselItem
              key={testimonial.name}
              className="pl-4 md:basis-1/2 lg:basis-1/3"
            >
              <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-left h-full">
                <StarRating rating={testimonial.rating} />

                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    {testimonial.name}
                  </h3>
                  {testimonial.verified && <VerifiedBadge />}
                </div>

                <p className="text-sm text-muted-foreground">
                  {testimonial.source}
                </p>

                <p className="text-base leading-relaxed text-foreground">
                  {testimonial.review}
                </p>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden lg:flex" />
        <CarouselNext className="hidden lg:flex" />
      </Carousel>
    </div>
  );
}
