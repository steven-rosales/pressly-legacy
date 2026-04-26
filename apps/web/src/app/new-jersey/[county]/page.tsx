import type { Metadata } from 'next';
import CountyRoute, {
  generateStaticParams as generateCountyStaticParams,
} from '@/routes/new-jersey/county/route';
import { buildCountyMetadata } from '@/lib/seo';

export const revalidate = 3600;
export const dynamicParams = false;
export const generateStaticParams = generateCountyStaticParams;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string }>;
}): Promise<Metadata> {
  const { county } = await params;
  return buildCountyMetadata(county);
}

export default CountyRoute;
