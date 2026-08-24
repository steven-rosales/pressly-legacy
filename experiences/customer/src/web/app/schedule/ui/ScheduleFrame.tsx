import { cn } from '#customer/styles/utils';

export function CentsFrame({
  className,
  orderUrl,
}: {
  className?: string;
  orderUrl: string;
}) {
  return (
    <iframe
      title="Pressly order scheduling"
      src={orderUrl}
      className={cn(
        'border-0 bg-background [touch-action:manipulation]',
        className,
      )}
      allow="payment *; clipboard-write"
    />
  );
}
