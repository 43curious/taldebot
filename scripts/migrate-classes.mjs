/** @param {import('@libsql/client').Client | import('@libsql/client').Transaction} client
 * @param {import('@libsql/client').Transaction | null} transaction */
// Safe to run again: only legacy classes tables need rebuilding.
export async function migrateClasses(client, transaction = null) {
    const existing = await client.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'classes'");
    const legacy = existing.rows[0] && !/UNIQUE\s*\(\s*degree_id\s*,\s*name\s*\)/i.test(existing.rows[0].sql);
    let hasProjectClass = false;
    let degreeColumn = false;
    if (legacy) {
        const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
        for (const { name } of tables.rows) {
            const references = await client.execute(`PRAGMA foreign_key_list("${name.replaceAll('"', '""')}")`);
            if (references.rows.some((ref) => ref.table === 'classes' && (!['projects', 'class_members'].includes(name) || ref.from !== 'class_id'))) {
                throw new Error(`Cannot migrate: unexpected class reference in ${name}`);
            }
        }
        const project = tables.rows.some((row) => row.name === 'projects');
        hasProjectClass = project && (await client.execute('PRAGMA table_info(projects)')).rows.some((row) => row.name === 'class_id');
        degreeColumn = (await client.execute('PRAGMA table_info(classes)')).rows.some((row) => row.name === 'degree_id');
    }

    const tx = transaction ?? await client.transaction('write');
    try {
        await tx.execute(`CREATE TABLE IF NOT EXISTS degrees (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        if (legacy) {
            await tx.execute('CREATE TABLE __classes_backup AS SELECT * FROM classes');
            const members = await tx.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'class_members'");
            if (members.rows.length) await tx.execute('CREATE TABLE __class_members_backup AS SELECT * FROM class_members');
            if (hasProjectClass) await tx.execute('CREATE TABLE __project_classes_backup AS SELECT id, class_id FROM projects WHERE class_id IS NOT NULL');
            await tx.execute('DROP TABLE classes');
        }
        await tx.execute(`CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, year INTEGER NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 50, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            degree_id INTEGER REFERENCES degrees(id) ON DELETE CASCADE,
            CONSTRAINT classes_degree_name_unique UNIQUE(degree_id, name)
        )`);
        if (legacy) {
            await tx.execute(`INSERT INTO classes (id, name, year, capacity, created_at, degree_id)
                SELECT id, name, year, capacity, created_at, ${degreeColumn ? 'degree_id' : 'NULL'} FROM __classes_backup`);
            await tx.execute('DROP TABLE __classes_backup');
        }
        await tx.execute(`CREATE TABLE IF NOT EXISTS class_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            name TEXT NOT NULL, email TEXT, division TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            national_id TEXT, tutor TEXT, town TEXT, academic_status TEXT, erasmus TEXT, dual TEXT, notes TEXT
        )`);
        if (legacy && (await tx.execute("SELECT name FROM sqlite_master WHERE name = '__class_members_backup'")).rows.length) {
            await tx.execute('INSERT INTO class_members SELECT * FROM __class_members_backup');
            await tx.execute('DROP TABLE __class_members_backup');
        }
        if (hasProjectClass) {
            await tx.execute(`UPDATE projects SET class_id = (SELECT class_id FROM __project_classes_backup WHERE id = projects.id)
                WHERE id IN (SELECT id FROM __project_classes_backup)`);
            await tx.execute('DROP TABLE __project_classes_backup');
        }
        const violations = await tx.execute('PRAGMA foreign_key_check');
        if (violations.rows.length) throw new Error('Migration would break foreign keys');
        if (!transaction) await tx.commit();
    } catch (error) {
        if (!transaction) await tx.rollback();
        throw error;
    }
}
