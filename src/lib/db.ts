import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../../db/schema';
import { databaseConfig } from './config';
import { measuredClient } from './requestMetrics';

// Astro loads .env for development; deployed secrets come from the runtime.
const client = createClient(
    databaseConfig({ ...import.meta.env, ...process.env }),
);
export const db = drizzle(measuredClient(client), { schema });
export type AppDatabase = typeof db;
