import Image from 'next/image';

interface DeliveryDetail {
  title: string;
  price: string;
  description: string;
}

interface DeliveryInfoProps {
  description: string;
  details: DeliveryDetail[];
  imageSrc?: string;
}

export default function DeliveryInfo({
  description,
  details,
  imageSrc,
}: DeliveryInfoProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start w-full">
      {/* Delivery Details - Left Side */}
      <div className="w-full lg:w-1/2 flex flex-col">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-6">
          Delivery
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed mb-8">
          {description}
        </p>

        <div className="space-y-4">
          {details.map((detail, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-background p-6 shadow-sm"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-medium">{detail.title}</h3>
                <span className="text-2xl font-semibold">{detail.price}</span>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed">
                {detail.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Image - Right Side */}
      {imageSrc && (
        <div className="relative w-full lg:w-1/2 aspect-video lg:aspect-4/3 rounded-lg overflow-hidden">
          <Image
            src={imageSrc}
            alt="Delivery information"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain"
          />
        </div>
      )}
    </div>
  );
}
