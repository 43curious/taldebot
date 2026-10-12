import { defineConfig } from 'drizzle-kit';

// Generation only. Applying changes requires an explicit target via db:migrate.
export default defineConfig({
    schema: './db/schema.ts',
    out: './db/migrations',
    dialect: 'turso',
});
