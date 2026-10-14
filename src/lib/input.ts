import { z } from 'zod';
import { skillScale } from './skills';

export class InputError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}

export const positiveId = z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER);
export function parseId(value: string | null): number | undefined {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const parsed = positiveId.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}

function jsonValue(value: string, context: z.RefinementCtx): unknown {
    try {
        return JSON.parse(value);
    } catch {
        context.addIssue({
            code: 'custom',
            message: 'Invalid JSON',
            fatal: true,
        });
        return z.NEVER;
    }
}
const json = z.string().transform(jsonValue);
const participantId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const selections = json.pipe(
    z
        .array(participantId)
        .refine(
            (ids) => new Set(ids).size === ids.length,
            'Duplicate selection',
        ),
);
const score = z.coerce.number().int().min(skillScale.min).max(skillScale.max);

export const submissionSchema = z
    .object({
        projectId: positiveId,
        studentId: positiveId,
        requestToken: z.string().optional(),
        lang: z.enum(['eu', 'en']).default('eu'),
        comfort: selections.pipe(z.array(participantId).max(1)),
        preferWith: selections.pipe(z.array(participantId).max(3)),
        preferAvoid: selections.pipe(z.array(participantId).max(3)),
        narrative_creativity: score,
        narrative_writing: score,
        narrative_references: score,
        narrative_communication: score,
        technical_camera: score,
        technical_sound: score,
        technical_editing: score,
        management_planning: score,
        management_production: score,
        soft_leadership: score,
        soft_listening: score,
        soft_proactivity: score,
        soft_teamwork: score,
        soft_motivation: score,
        soft_conflict: score,
        email: z.string().trim().email(),
    })
    .superRefine((data, context) => {
        const ids = [...data.comfort, ...data.preferWith, ...data.preferAvoid];
        if (ids.includes(data.studentId) || new Set(ids).size !== ids.length) {
            context.addIssue({
                code: 'custom',
                message:
                    'Selections must be distinct and cannot include yourself',
            });
        }
    });
export type Submission = z.infer<typeof submissionSchema>;

const optionalCount = z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
);
const participantSchema = z.object({
    name: z.string().trim().min(1),
    email: z.union([z.string().trim().email(), z.literal('')]).default(''),
    studentRecordId: participantId.optional(),
});
export const projectSchema = z
    .object({
        name: z.string().trim().min(1),
        description: z.string().optional(),
        academicPeriod: z
            .string()
            .regex(/^\d{4}-\d{4}$/)
            .optional(),
        historyMode: z.enum(['variety', 'balanced', 'familiar']).optional(),
        numTeams: optionalCount,
        targetTeamSize: optionalCount,
        projectType: z.enum([
            'narrative',
            'technical',
            'management',
            'balanced',
        ]),
        adminEmail: z.string().trim().email(),
        studentList: z.string().optional(),
        classGroupId: z.preprocess(
            (value) => (value === '' ? undefined : value),
            positiveId.optional(),
        ),
        studentsJson: z.preprocess(
            (value) => (value === '' ? undefined : value),
            json.pipe(z.array(participantSchema)).optional(),
        ),
    })
    .refine(
        (data) =>
            data.numTeams !== undefined || data.targetTeamSize !== undefined,
        'Team count or size is required',
    );
export type ProjectInput = z.infer<typeof projectSchema>;

export function routeError(error: unknown) {
    if (error instanceof z.ZodError)
        return Response.json(
            { error: 'Invalid input', issues: error.issues },
            { status: 400 },
        );
    if (error instanceof InputError)
        return Response.json(
            { error: error.message },
            { status: error.status },
        );
    console.error(error);
    return Response.json({ error: 'Unable to save changes' }, { status: 500 });
}

const skillObject = (keys: readonly string[]) =>
    z
        .object(Object.fromEntries(keys.map((key) => [key, score.optional()])))
        .strict();
export const independentUpdateSchema = z.object({
    requestToken: z.string(),
    lang: z.enum(['eu', 'en']).default('eu'),
    assessmentJson: json
        .pipe(
            z
                .object({
                    skillsNarrative: skillObject([
                        'creativity',
                        'writing',
                        'references',
                        'communication',
                    ]),
                    skillsTechnical: skillObject([
                        'camera',
                        'sound',
                        'editing',
                    ]),
                    skillsManagement: skillObject(['planning', 'production']),
                    skillsSoft: skillObject([
                        'leadership',
                        'listening',
                        'proactivity',
                        'teamwork',
                        'conflict',
                    ]),
                })
                .strict(),
        )
        .optional(),
    preferencesJson: json
        .pipe(
            z
                .object({
                    comfort: z.array(participantId).max(1),
                    preferWith: z.array(participantId).max(3),
                    preferAvoid: z.array(participantId).max(3),
                })
                .strict(),
        )
        .optional(),
});
