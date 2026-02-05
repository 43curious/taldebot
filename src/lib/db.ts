import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../../db/schema';

import * as dotenv from 'dotenv';

// Cargar variables de entorno si estamos en un script de Node
if (typeof process !== 'undefined') {
    dotenv.config();
}

// Intentamos pillar las variables de varias formas para asegurar compatibilidad con Netlify
const getEnv = (key: string) => {
    if (typeof process !== 'undefined' && process.env[key]) return process.env[key];
    try {
        // @ts-ignore - Solo disponible en Vite/Astro
        return import.meta.env[key];
    } catch (e) {
        return undefined;
    }
};

const url = getEnv('TURSO_CONNECTION_URL');
const authToken = getEnv('TURSO_AUTH_TOKEN');

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
