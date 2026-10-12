import { withDatabase, reportFailure } from './database';
import { migrateDatabase } from './migrations';

withDatabase(async (_db, client, args) => {
    if (args.length)
        throw new Error('Usage: npm run db:migrate -- --local|--remote');
    await migrateDatabase(client);
    console.log('Database migrations complete.');
}).catch(reportFailure);
