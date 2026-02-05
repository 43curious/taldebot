import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
    schema: './db/schema.ts',
    out: './drizzle',
    dialect: 'turso',
    dbCredentials: {
        url: process.env.TURSO_CONNECTION_URL || 'file:sqlite.db',
        authToken: process.env.TURSO_AUTH_TOKEN,
    },
});
