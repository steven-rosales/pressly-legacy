import Image from 'next/image';

const STEPS = [
  {
    title: 'Your driver will pickup between 6:30pm-9:30pm',
    description:
      'Enjoy the convenience of our 7-day-a-week pickup and delivery service.',
    imageSrc: '/graphic-img/1-how-it-works.webp',
    imageAlt: 'Schedule pickup on mobile device',
  },
  {
    title: 'Industry experts will carefully clean everything',
    description:
      'Professionals with decades of experience handle all your laundry and dry cleaning.',
    imageSrc: '/graphic-img/2-how-it-works.webp',
    imageAlt: 'Professional cleaning equipment',
  },
  {
    title: 'Enjoy always having clean clothes at your fingertips',
    description:
      "With our quick turnarounds you'll always find a clean closet—and a clean peace of mind.",
    imageSrc: '/graphic-img/3-how-it-works.webp',
    imageAlt: 'Clean laundry delivered to your door',
  },
];

export default function HowItWorks() {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
        How It Works
      </p>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-12 sm:mb-16 lg:mb-20 max-w-4xl">
        A solution for everything in your wardrobe.
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 w-full">
        {STEPS.map((step, index) => (
          <div key={index} className="flex flex-col items-center">
            <div className="relative w-full max-w-[220px] aspect-square mb-6 lg:mb-8">
              <Image
                src={step.imageSrc}
                alt={step.imageAlt}
                fill
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
