import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required. ' +
    'Use ./run.sh test|prod with a populated .env.test or .env.prod file.'
  );
}

const client = postgres(process.env.DATABASE_URL);

export const db = drizzle(client);
