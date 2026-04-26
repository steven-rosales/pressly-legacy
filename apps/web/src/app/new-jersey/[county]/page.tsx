import CountyRoute, {
  generateStaticParams as generateCountyStaticParams,
} from '@/routes/new-jersey/county/route';

export const revalidate = 3600;
export const metadata = {
  title: 'Laundry & Dry Cleaning in New Jersey | Pressly',
  description:
    'County-specific laundry and dry cleaning pickup and delivery in New Jersey. Free pickup & delivery with fast turnaround.',
};
export const generateStaticParams = generateCountyStaticParams;

export default CountyRoute;
