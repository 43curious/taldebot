import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../../db/schema';

// Intentamos pillar las variables de varias formas para asegurar compatibilidad con Netlify
const url = process.env.TURSO_CONNECTION_URL || import.meta.env.TURSO_CONNECTION_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || import.meta.env.TURSO_AUTH_TOKEN;

if (!url || url.includes('sqlite.db')) {
    console.warn("⚠️ [DB] CUIDADO: No se ha detectado TURSO_CONNECTION_URL. Usando base de datos local vacía.");
} else {
    console.log("✅ [DB] Conectando a Turso:", url.split('@')[0]); // Log seguro sin el token completo
}

const client = createClient({
    url: url || 'file:sqlite.db',
    authToken: authToken,
});

export const db = drizzle(client, { schema });
