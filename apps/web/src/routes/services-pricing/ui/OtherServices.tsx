import Image from 'next/image';

interface Service {
  title: string;
  price: string;
  description: string;
}

interface OtherServicesProps {
  title: string;
  subtitle: string;
  services: Service[];
  imageSrc?: string;
}

export default function OtherServices({
  title,
  subtitle,
  services,
  imageSrc,
}: OtherServicesProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start w-full">
      <div className="w-full lg:w-1/2 flex flex-col">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-4">
          {title}
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground mb-8">
          {subtitle}
        </p>

        <div className="space-y-4">
          {services.map((service, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-background p-6 shadow-sm"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-semibold">{service.title}</h3>
                <span className="text-2xl font-bold">{service.price}</span>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {imageSrc && (
        <div className="relative w-full lg:w-1/2 aspect-video lg:aspect-4/3 rounded-lg overflow-hidden">
          <Image
            src={imageSrc}
            alt="Other laundry services"
            fill
            className="object-contain"
          />
        </div>
      )}
    </div>
  );
}
