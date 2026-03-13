import { closeDb, getDb } from '../src/db';

async function main() {
  await getDb();
  console.log('Database migrations are up to date.');
  await closeDb();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
