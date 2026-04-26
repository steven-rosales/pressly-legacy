import { CommercialContactSection } from '@/routes/shared/marketing/public';
import { PublicSiteShell } from '@/routes/shared/public/PublicSiteShell';

export default function CommercialRoute() {
  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-360 px-4 pt-12 pb-22 sm:px-6 lg:py-20">
        <CommercialContactSection />
      </section>
    </PublicSiteShell>
  );
}
