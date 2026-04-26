import CityServiceRoute, {
  generateStaticParams as generateCityServiceStaticParams,
} from '@/routes/new-jersey/city-service/route';

export const revalidate = 3600;
export const generateStaticParams = generateCityServiceStaticParams;

export default CityServiceRoute;
