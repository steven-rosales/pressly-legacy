import Image from 'next/image';

interface ServiceHeroProps {
  title: string;
  description: string[];
  imageSrc: string;
  imageAlt: string;
}

export default function ServiceHero({
  title,
  description,
  imageSrc,
  imageAlt,
}: ServiceHeroProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center w-full">
      <div className="w-full lg:w-1/2 flex flex-col">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-6 lg:mb-8">
          {title}
        </h1>
        <div className="space-y-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
          {description.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 aspect-video rounded-lg overflow-hidden">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
