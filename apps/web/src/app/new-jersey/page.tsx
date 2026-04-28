import NewJerseyRoute from '@/routes/new-jersey/route';
import { buildStateMetadata } from '@/routes/shared/marketing/seo';

export const revalidate = 3600;
export const metadata = buildStateMetadata();

export default NewJerseyRoute;
