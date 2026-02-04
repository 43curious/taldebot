import 'dotenv/config';
import { db } from '../src/lib/db';
import { users } from './schema';
import { hashPassword } from '../src/lib/auth';
import { eq } from 'drizzle-orm';

async function seed() {
    const adminUsername = 'admin';
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error('Error: INITIAL_ADMIN_PASSWORD environment variable is not set.');
        console.error('Please create a .env file with INITIAL_ADMIN_PASSWORD=your_secure_password');
        process.exit(1);
    }

    // Check if the master admin already exists
    const existingAdmin = await db.query.users.findFirst({
        where: eq(users.username, adminUsername),
    });

    if (existingAdmin) {
        console.log('Master admin already exists.');
        return;
    }

    const hashedPassword = await hashPassword(adminPassword);

    await db.insert(users).values({
        username: adminUsername,
        hashedPassword: hashedPassword,
        role: 'master',
        fullName: 'Master Administrator',
        email: 'admin@example.com',
    });

    console.log('--------------------------------------------------');
    console.log('Master admin created successfully!');
    console.log(`Username: ${adminUsername}`);
    console.log(`Password: ${adminPassword}`);
    console.log('IMPORTANT: Please change this password after your first login.');
    console.log('--------------------------------------------------');
}

seed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
});
