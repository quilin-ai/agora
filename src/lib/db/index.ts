import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required. ' +
    'Copy .env.example to .env and fill in your database connection string.'
  );
}

const client = postgres(process.env.DATABASE_URL);

export const db = drizzle(client);
