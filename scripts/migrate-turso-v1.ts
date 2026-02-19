import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.TURSO_CONNECTION_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    console.error("Missing TURSO_CONNECTION_URL");
    process.exit(1);
}

const client = createClient({
    url,
    authToken,
});

async function migrate() {
    try {
        console.log("Updating existing teams in Turso to 'v1'...");
        const result = await client.execute("UPDATE teams SET algorithm_version = 'v1' WHERE algorithm_version IS NULL OR algorithm_version = 'v2'");
        console.log(`Migration successful. Rows affected: ${result.rowsAffected}`);
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        process.exit(0);
    }
}

migrate();
