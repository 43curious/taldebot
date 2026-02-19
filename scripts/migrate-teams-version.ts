import Database from 'better-sqlite3';

const sqlite = new Database('sqlite.db');

try {
    // Check if column exists
    const tableInfo = sqlite.prepare("PRAGMA table_info(teams)").all() as any[];
    const columnExists = tableInfo.some(col => col.name === 'algorithm_version');

    if (!columnExists) {
        console.log('Adding algorithm_version column to teams table...');
        sqlite.exec("ALTER TABLE teams ADD COLUMN algorithm_version TEXT DEFAULT 'v2'");

        console.log('Marking existing teams as v1...');
        sqlite.prepare("UPDATE teams SET algorithm_version = 'v1'").run();

        console.log('Migration completed successfully.');
    } else {
        console.log('Column algorithm_version already exists. Skipping migration.');
    }
} catch (error) {
    console.error('Migration failed:', error);
} finally {
    sqlite.close();
}
