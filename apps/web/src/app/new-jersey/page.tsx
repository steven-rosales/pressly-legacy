import NewJerseyRoute from '@/routes/new-jersey/index/route';
import { buildStateMetadata } from '@/lib/seo';

export const revalidate = 3600;
export const metadata = buildStateMetadata();

export default NewJerseyRoute;
