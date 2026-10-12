import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../../db/schema';
import { databaseConfig } from './config';

// Astro loads .env for development; deployed secrets come from the runtime.
const client = createClient(
    databaseConfig({ ...import.meta.env, ...process.env }),
);
export const db = drizzle(client, { schema });
export type AppDatabase = typeof db;
