import { db } from '../src/lib/db';
import { users } from '../db/schema';
import { hashPassword } from '../src/lib/auth';
import * as dotenv from 'dotenv';

dotenv.config();

async function createAdmin() {
    const username = 'admin';
    const password = process.env.INITIAL_ADMIN_PASSWORD;

    if (!password) {
        console.error('❌ Error: INITIAL_ADMIN_PASSWORD not set in .env');
        process.exit(1);
    }

    console.log(`🚀 Creating admin user: ${username}...`);

    try {
        const hashedPassword = await hashPassword(password);

        await db.insert(users).values({
            username,
            hashedPassword,
            role: 'master',
            fullName: 'Administrator',
            email: process.env.SMTP_USER || 'admin@example.com',
        }).onConflictDoUpdate({
            target: users.username,
            set: { hashedPassword }
        });

        console.log('✅ Admin user created/updated successfully!');
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
    }
}

createAdmin();
