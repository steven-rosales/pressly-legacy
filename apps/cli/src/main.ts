#!/usr/bin/env node
import 'dotenv/config';

const main = async (): Promise<void> => {
  process.stdout.write('Pressly admin CLI is ready.\n');
};

await main();
