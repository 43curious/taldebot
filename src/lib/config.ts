export type Environment = Record<string, string | undefined>;
export type DatabaseTarget = 'local' | 'remote';

// CLI callers always choose a target; development defaults to a local file.
export function databaseConfig(env: Environment, target?: DatabaseTarget) {
    const localUrl = env.LOCAL_DATABASE_URL || 'file:sqlite.db';
    if (!localUrl.startsWith('file:'))
        throw new Error('LOCAL_DATABASE_URL must use file:');
    if (target === 'local') return { url: localUrl };
    const url = env.TURSO_CONNECTION_URL;
    const deployed = env.NETLIFY === 'true' || env.NODE_ENV === 'production';
    if (target === 'remote' || (deployed && target === undefined)) {
        if (!url || url.startsWith('file:') || !env.TURSO_AUTH_TOKEN) {
            throw new Error(
                'Remote database requires TURSO_CONNECTION_URL and TURSO_AUTH_TOKEN',
            );
        }
    }
    return url ? { url, authToken: env.TURSO_AUTH_TOKEN } : { url: localUrl };
}

export function smtpConfig(env: Environment) {
    if (!env.SMTP_HOST) return undefined;
    const port = Number(env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Invalid SMTP_PORT');
    if (!env.SMTP_USER || !env.SMTP_PASS)
        throw new Error('SMTP_USER and SMTP_PASS are required with SMTP_HOST');
    return {
        host: env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    };
}
