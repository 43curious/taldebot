import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { projects, students, responses, teams } from '../../../db/schema';
import { projectSchema, submissionSchema, parseId } from '../input';
import {
    createProject,
    submitSurvey,
    resetSurvey,
    replaceTeams,
} from '../projectOperations';
import { skillGroups } from '../skills';
import { studentPath } from '../i18n';
import { testDatabase } from './testDatabase';

let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeEach(async () => {
    fixture = await testDatabase();
});
afterEach(async () => {
    await fixture.close();
});

const projectInput = {
    name: 'Film',
    numTeams: '2',
    projectType: 'balanced',
    adminEmail: 'teacher@example.com',
    studentList: 'Ane\nIker',
};
const formInput = () => ({
    projectId: '1',
    studentId: '1',
    email: 'ane@example.com',
    lang: 'eu',
    comfort: '[2]',
    preferWith: '[]',
    preferAvoid: '[]',
    ...Object.fromEntries(
        skillGroups.flatMap((group) =>
            group.keys.map((key) => [`${group.prefix}_${key}`, '5']),
        ),
    ),
});

it('rejects malformed skill, identity, roster, and relationship input before writes', () => {
    for (const patch of [
        { comfort: 'bad json' },
        { comfort: 'null' },
        { preferWith: '["two"]' },
        { preferWith: '["2"]' },
        { preferWith: '[true]' },
        { preferWith: '[2,2]' },
        { comfort: '[1]' },
        { comfort: '[2,3]' },
        { preferAvoid: '[2]' },
        { preferWith: '[3,4,5,6]' },
        { studentId: '-1' },
        { projectId: '1.5' },
        { narrative_creativity: '11' },
        { technical_camera: '0' },
        { soft_listening: '4.5' },
        { lang: 'es' },
    ])
        expect(
            submissionSchema.safeParse({ ...formInput(), ...patch }).success,
        ).toBe(false);
    for (const studentsJson of [
        '[{}]',
        '{}',
        'null',
        '[{"name":"Ane","email":"invalid"}]',
    ]) {
        expect(
            projectSchema.safeParse({ ...projectInput, studentsJson }).success,
        ).toBe(false);
    }
    for (const id of ['1x', '1.5', '-1', '0', '', '9007199254740992'])
        expect(parseId(id)).toBeUndefined();
    expect(parseId('12')).toBe(12);
});

it.each(['eu', 'en'] as const)(
    'submits once in %s, scopes peers to the project, and resets both response and completion',
    async (lang) => {
        const { db } = fixture;
        await createProject(db, projectSchema.parse(projectInput));
        await createProject(
            db,
            projectSchema.parse({ ...projectInput, name: 'Other' }),
        );
        await expect(
            submitSurvey(
                db,
                submissionSchema.parse({
                    ...formInput(),
                    comfort: '[3]',
                    lang,
                }),
            ),
        ).rejects.toThrow('outside this project');
        expect(await db.select().from(responses)).toHaveLength(0);
        await submitSurvey(
            db,
            submissionSchema.parse({ ...formInput(), lang }),
        );
        expect(await db.select().from(responses)).toHaveLength(1);
        expect(
            (await db.query.students.findFirst({ where: eq(students.id, 1) }))
                ?.hasCompleted,
        ).toBe(true);
        await expect(
            submitSurvey(db, submissionSchema.parse(formInput())),
        ).rejects.toThrow('already completed');
        expect(studentPath(lang, '/student/confirmation')).toBe(
            lang === 'en'
                ? '/en/student/confirmation'
                : '/student/confirmation',
        );
        await resetSurvey(db, 1, 1);
        expect(await db.select().from(responses)).toHaveLength(0);
        expect(
            (await db.query.students.findFirst({ where: eq(students.id, 1) }))
                ?.hasCompleted,
        ).toBe(false);
        await expect(resetSurvey(db, 2, 1)).rejects.toThrow('not found');
    },
);

it('rolls back a project when inserting participants fails', async () => {
    await fixture.client.execute(
        "CREATE TRIGGER fail_students BEFORE INSERT ON students BEGIN SELECT RAISE(ABORT, 'fail'); END",
    );
    await expect(
        createProject(fixture.db, projectSchema.parse(projectInput)),
    ).rejects.toThrow();
    expect(await fixture.db.select().from(projects)).toHaveLength(0);
    expect(await fixture.db.select().from(students)).toHaveLength(0);
});

it('rolls back response submission and reset when the completion update fails', async () => {
    await createProject(fixture.db, projectSchema.parse(projectInput));
    await fixture.client.execute(
        "CREATE TRIGGER fail_completion BEFORE UPDATE ON students BEGIN SELECT RAISE(ABORT, 'fail'); END",
    );
    await expect(
        submitSurvey(fixture.db, submissionSchema.parse(formInput())),
    ).rejects.toThrow();
    expect(await fixture.db.select().from(responses)).toHaveLength(0);
    await fixture.client.execute('DROP TRIGGER fail_completion');
    await submitSurvey(fixture.db, submissionSchema.parse(formInput()));
    await fixture.client.execute(
        "CREATE TRIGGER fail_reset BEFORE UPDATE ON students BEGIN SELECT RAISE(ABORT, 'fail'); END",
    );
    await expect(resetSurvey(fixture.db, 1, 1)).rejects.toThrow();
    expect(await fixture.db.select().from(responses)).toHaveLength(1);
    expect((await fixture.db.query.students.findFirst())?.hasCompleted).toBe(
        true,
    );
});

it('keeps both algorithm allocations when replacement fails and preserves the other version on success', async () => {
    await createProject(fixture.db, projectSchema.parse(projectInput));
    const team = {
        teamNumber: 1,
        memberIds: [1, 2],
        justification: 'original',
    };
    await replaceTeams(fixture.db, 1, 'v1', [team]);
    await replaceTeams(fixture.db, 1, 'v2', [team]);
    await fixture.client.execute(
        "CREATE TRIGGER fail_teams BEFORE INSERT ON teams BEGIN SELECT RAISE(ABORT, 'fail'); END",
    );
    await expect(
        replaceTeams(fixture.db, 1, 'v2', [{ ...team, justification: 'new' }]),
    ).rejects.toThrow();
    expect(
        (await fixture.db.select().from(teams)).map(
            (team) => team.justification,
        ),
    ).toEqual(['original', 'original']);
    await fixture.client.execute('DROP TRIGGER fail_teams');
    await replaceTeams(fixture.db, 1, 'v2', [
        { ...team, justification: 'new' },
    ]);
    const saved = await fixture.db.select().from(teams);
    expect(
        saved.find((team) => team.algorithmVersion === 'v1')?.justification,
    ).toBe('original');
    expect(
        saved.find((team) => team.algorithmVersion === 'v2')?.justification,
    ).toBe('new');
});
