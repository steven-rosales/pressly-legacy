'use client';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

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
    verified: true,
    petInfo: 'on Google',
    rating: 5,
    review:
      'I have been using this laundry service for over a year now, and I can confidently say that they have been nothing but a blessing. I highly recommend this service to anyone looking for laundry services.',
  },
  {
    review:
      'Great service...wash and fold is impeccable and they sort the laundry for you. I have used them twice and look forward to using them in the near future.',
    name: "The People's Reviewer",
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "This place by far is my favorite! I have a hectic schedule so getting to the laundry mat is nearly impossible but Pressly makes is possible. It's seamless and quick 10/10. And probably the only place i will continue doing business with !!!!",
    name: 'Gina S.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "I get my laundry picked up/delivered roughly once a month & the service is always fantastic. They're also the most reasonably priced pick up/delivery service I've found near me. I love that I can choose to have a fragrance-free, hypoallergenic...",
    name: 'Meredith G.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'The only complaint is that I never found you sooner. As a single professional mom of a young boy. We have a lot of wash. You get the stains out without any trouble and never have charged a penny extra. I will recommend you and your team again and again!!!',
    name: 'Carlye G.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "I've been using Pressly for a few months now and I love their service. The convenience of scheduling the pick up online is great and they are always very responsive. My clothes always smells fantastic!",
    name: 'Janette M.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'Seriously, the best!! They are super responsive, take good care of my clothes, and have a fast turnaround. I recommend them to anyone who needs their laundry done!',
    name: 'Mariana G.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'They are always on time, clothes are nicely washed and the price is great!',
    name: 'Jonathan F.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'Best delivery service around. My clothes come back smelling great and they get spots even i can get out with my washes!',
    name: 'Abdallah H.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'Great professional laundry service! I love how convenient it is. Our clothes always come back clean, smell amazing and are folded beautifully.',
    name: 'Ewelina D.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'The clothes always smells so amazing washed well and folded well. If you have any concerns they respond right away. I also think you get good bang for your buck using this service instead of a laundromat.',
    name: 'Alexus H.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'Awesome service and very kind! It is a stress off my shoulders having my laundry delivered quickly and efficiently every time. Highly recommend!!!!',
    name: 'Genssy L.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'I am so happy with they way my laundry is done. Everything is perfectly folded and bagged. The pickup and delivery service is very easy.',
    name: 'Lorraine F.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "Very quick to respond. Easy & pleasant. I leave my laundry on the front porch it's picked up and dropped off the next day. Clothes smell amazing fresh and clean! Convenient and affordable.",
    name: 'Ashura M.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "It's a pleasure working with Pressly. Laundry is returned the next day smelling fresh and clean. Laundry is folded, sorted and neatly stacked in clear heavy duty clear bags. Laundry is picked up at your door step and returned on your...",
    name: 'Elaine B.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "Best laundry service I've had! Clothes are neatly folded and smell great when they return. They always respond within minutes and clothes are always back in about 24 hours. I recommend them to everyone.",
    name: 'Trinity R.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'A1 Service. 10 Stars. I accidentally pondered on Pressly. Steven: Thanks. My clothes are washed with love, filled love, and delivered with love.',
    name: 'Carla R.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'Pressly is the best laundry service out there. The laundry is done perfectly and to your liking, very reasonably priced and excellent customer service!',
    name: 'Elaine D.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      'Highly recommended, very professional, excellent customer service. I am a current customer, pick-up and drop off laundry service every 2 weeks. They are simply a time saver.',
    name: 'Maria F.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "Love Pressly. The service is excellent. Every time I use Pressly, everything is so perfect. My clothes are always folded nice neat. I'm always a happy with their service.",
    name: 'Charlene H.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
  },
  {
    review:
      "My washer is being repaired, this service has been so convenient and amazing and the pricing is so reasonable that I definitely see myself using this service regularly. I really couldn't be happier and I highly recommend them I'm telling ALL my friends!!!",
    name: 'Dee S.',
    verified: true,
    petInfo: 'on Google',
    rating: 5,
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

export default function LocationsTestimonials() {
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
