'use client';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/common/shadcn/carousel';

const TESTIMONIALS = [
  {
    name: 'Shaunta J.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
    review:
      'Laundry service is top notch! They pick up and deliver. It is a completely seamless process! I will continue to use their services.',
  },
  {
    name: 'Carla R.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
    review:
      'I get my laundry picked up and delivered hassle free. My Laundry is picked up within a 2 hour window and delivered the very next day. The laundry comes back superb. Washed well, whites come back whiter, smelling great and folded prestige. I will be a forever be a customer.',
  },
  {
    name: 'Joe S.',
    verified: false,
    petInfo: 'on Google',
    rating: 5,
    review:
      'I have been using this laundry service for over a year now, and I can confidently say that they have been nothing but a blessing. I highly recommend this service to anyone looking for laundry services.',
  },
];

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

export default function HomeTestimonials() {
  return (
    <div className="flex flex-col items-center text-center w-full">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
        Testimonials
      </p>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-12 sm:mb-16 lg:mb-20 max-w-4xl">
        What Our Customers Say
      </h2>

      <Carousel
        opts={{
          align: 'start',
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {TESTIMONIALS.map((testimonial, index) => (
            <CarouselItem
              key={index}
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
                  {testimonial.petInfo}
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
