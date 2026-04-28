import { PublicSiteShell } from '@/routes/shared/ui/public/PublicSiteShell';
import CommercialContactSection from './ui/CommercialContactSection';

export default function CommercialRoute() {
  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-360 px-4 pt-12 pb-22 sm:px-6 lg:py-20">
        <CommercialContactSection />
      </section>
    </PublicSiteShell>
  );
}
