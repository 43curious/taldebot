import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { users } from '../db/schema';
import { withDatabase, reportFailure } from './database';

withDatabase(async (db, _client, args) => {
    if (
        args.length > 1 ||
        (args.length === 1 && args[0] !== '--reset-password')
    ) {
        throw new Error(
            'Usage: npm run db:admin -- --local|--remote [--reset-password]',
        );
    }
    const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!password) throw new Error('INITIAL_ADMIN_PASSWORD is required');
    await db.transaction(async (tx) => {
        const existing = await tx.query.users.findFirst({
            where: eq(users.username, username),
        });
        if (args.includes('--reset-password')) {
            if (!existing)
                throw new Error(
                    'Account does not exist; create it without --reset-password',
                );
            await tx
                .update(users)
                .set({ hashedPassword: await hash(password, 10) })
                .where(eq(users.id, existing.id));
            console.log('Administrator password reset.');
        } else {
            if (existing) {
                console.log('Account already exists; password unchanged.');
                return;
            }
            await tx
                .insert(users)
                .values({
                    username,
                    hashedPassword: await hash(password, 10),
                    role: 'master',
                    fullName: 'Administrator',
                });
            console.log('Administrator created.');
        }
    });
}).catch(reportFailure);
