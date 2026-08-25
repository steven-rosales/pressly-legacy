import { createPostgresRuntime } from '@pressly/postgres/client';
import { seedPricing } from '@pressly/pricing-system/seeding/pricing';
import { makePricingSchema } from '@pressly/pricing-system/schema';
import {
  loadPostgresToolingEnvironment,
  requirePostgresToolingDatabaseUrl,
} from './environment.ts';

loadPostgresToolingEnvironment();

const databaseUrl = requirePostgresToolingDatabaseUrl({
  code: 'pricing_seed_database_url_missing',
  message: 'DATABASE_URL is required to seed pricing.',
});
const database = createPostgresRuntime({
  databaseUrl,
  schema: makePricingSchema(),
});

try {
  await seedPricing(database.db);
  process.stdout.write('pricing seed completed\n');
} finally {
  await database.close();
}
