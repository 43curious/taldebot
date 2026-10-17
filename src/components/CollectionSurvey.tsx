import { useRef, useState, type SyntheticEvent } from 'react';
import { SkillSlider } from './SkillSlider';
import { MultiSelect } from './MultiSelect';
import {
    surveyCopy,
    type Question,
    type QuestionAnswers,
} from '../lib/questionnaires';
import type { Language } from '../lib/i18n';
import type { PreferenceKind } from '../lib/trackingTypes';
import type { TeacherSurveyTarget } from '../lib/teacherSurveyTarget';
interface Props {
    questions: Question[];
    peers: { id: number; name: string }[];
    studentId: number;
    token: string;
    lang: Language;
    trialVersionId?: number;
    teacherTarget?: TeacherSurveyTarget;
    teacherReturn?: string;
    initialEmail?: string;
    initialPreferences?: Record<PreferenceKind, number[]>;
}
export default function CollectionSurvey({
    questions,
    peers,
    studentId,
    token,
    lang,
    trialVersionId,
    teacherTarget,
    teacherReturn,
    initialEmail,
    initialPreferences,
}: Props) {
    const formRef = useRef<HTMLFormElement>(null);
    const [preferences, setPreferences] = useState<
        Record<PreferenceKind, number[]>
    >(initialPreferences ?? { comfort: [], preferWith: [], preferAvoid: [] });
    const [saving, setSaving] = useState(false),
        [error, setError] = useState(''),
        [done, setDone] = useState(false);
    const tr = surveyCopy(lang);
    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!formRef.current || saving) return;
        setSaving(true);
        setError('');
        const form = new FormData(formRef.current),
            answers: QuestionAnswers = {};
        for (const question of questions) {
            if (question.type === 'skill')
                answers[question.key] = form.has(question.key)
                    ? Number(form.get(question.key))
                    : null;
            else if (question.type === 'preference')
                answers[question.key] = preferences[question.key];
            else
                answers[question.key] = Object.fromEntries(
                    peers
                        .filter((p) => p.id !== studentId)
                        .flatMap((peer) => {
                            const answer = form.get(`collaboration-${peer.id}`);
                            return answer === 'worked' || answer === 'never'
                                ? [[String(peer.id), answer]]
                                : [];
                        }),
                );
        }
        try {
            const response = await fetch(
                teacherTarget
                    ? '/api/admin/submit-survey'
                    : trialVersionId
                      ? '/api/admin/trial-questionnaire'
                      : '/api/student/submit-survey',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token,
                        target: teacherTarget,
                        email:
                            teacherTarget?.kind === 'project'
                                ? form.get('email')
                                : undefined,
                        versionId: trialVersionId,
                        studentId,
                        answers,
                        consent: form.get('consent') === 'on',
                    }),
                },
            );
            if (!response.ok) throw new Error('Submission failed');
            setDone(true);
        } catch {
            setError(tr.error);
            setSaving(false);
        }
    }
    if (done)
        return (
            <section className="teacher-panel p-5 sm:p-6" role="status">
                <h2 className="text-xl">
                    {teacherTarget
                        ? lang === 'en'
                            ? 'Answers saved on the student’s behalf'
                            : 'Erantzunak ikaslearen partez gorde dira'
                        : trialVersionId
                          ? lang === 'en'
                              ? 'Trial completed'
                              : 'Proba osatu da'
                          : tr.done}
                </h2>
                <p className="mt-3 text-sm text-slate-600">
                    {teacherTarget
                        ? lang === 'en'
                            ? 'Your name was recorded with these answers.'
                            : 'Zure izena erantzunekin batera gorde da.'
                        : trialVersionId
                          ? lang === 'en'
                              ? 'Your answers are valid. Nothing was saved.'
                              : 'Erantzunak baliozkoak dira. Ez da ezer gorde.'
                          : tr.doneNote}
                </p>
                {teacherReturn && (
                    <a
                        href={`${teacherReturn}?saved=teacher-entry`}
                        className="teacher-button mt-5"
                    >
                        {lang === 'en'
                            ? 'Return to follow-up'
                            : 'Jarraipenera itzuli'}
                    </a>
                )}
            </section>
        );
    return (
        <form
            ref={formRef}
            onKeyDown={(event) => {
                if (
                    event.key === 'Enter' &&
                    event.target instanceof HTMLInputElement
                )
                    event.preventDefault();
            }}
            onSubmit={submit}
            className="teacher-panel space-y-6 p-4 sm:p-6"
        >
            {teacherTarget?.kind === 'project' && (
                <label className="teacher-label">
                    {lang === 'en' ? 'Student email' : 'Ikaslearen emaila'}
                    <input
                        type="email"
                        name="email"
                        defaultValue={initialEmail}
                        required
                        autoComplete="off"
                    />
                </label>
            )}
            {questions.map((question) => (
                <div key={question.key}>
                    {question.type === 'skill' ? (
                        <div className="survey-skill-group">
                            <div className="survey-skill-item">
                                <SkillSlider
                                    label={question.label[lang]}
                                    name={question.key}
                                    description={question.explanation[lang]}
                                    unknownLabel={
                                        teacherTarget?.kind === 'project'
                                            ? undefined
                                            : teacherTarget
                                              ? lang === 'en'
                                                  ? 'Student’s assessment unavailable'
                                                  : 'Ez dago ikaslearen baloraziorik'
                                              : tr.unknown
                                    }
                                />
                            </div>
                        </div>
                    ) : question.type === 'preference' ? (
                        <MultiSelect
                            lang={lang}
                            name={question.key}
                            label={question.label[lang]}
                            placeholder={question.explanation[lang]}
                            options={peers}
                            value={preferences[question.key]}
                            maxSelections={question.key === 'comfort' ? 1 : 3}
                            onChange={(ids) =>
                                setPreferences((previous) => ({
                                    ...previous,
                                    [question.key]: ids,
                                }))
                            }
                            excludedIds={[
                                studentId,
                                ...Object.entries(preferences)
                                    .filter(([key]) => key !== question.key)
                                    .flatMap(([, ids]) => ids),
                            ]}
                            variant={
                                question.key === 'preferAvoid'
                                    ? 'red'
                                    : question.key === 'comfort'
                                      ? 'green'
                                      : 'teal'
                            }
                        />
                    ) : (
                        <fieldset className="rounded-xl border border-slate-200 p-4">
                            <legend className="px-1 text-sm font-bold text-slate-900">
                                {question.label[lang]}
                            </legend>
                            <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                                {question.explanation[lang]}
                            </p>
                            <div className="divide-y divide-slate-100">
                                {peers
                                    .filter((peer) => peer.id !== studentId)
                                    .map((peer) => (
                                        <label
                                            key={peer.id}
                                            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-slate-700"
                                        >
                                            <span>{peer.name}</span>
                                            <select
                                                name={`collaboration-${peer.id}`}
                                                className="max-w-full"
                                            >
                                                <option value="">
                                                    {tr.unasked}
                                                </option>
                                                <option value="worked">
                                                    {tr.worked}
                                                </option>
                                                <option value="never">
                                                    {tr.never}
                                                </option>
                                            </select>
                                        </label>
                                    ))}
                            </div>
                        </fieldset>
                    )}
                </div>
            ))}
            {questions.some((q) => q.type === 'skill') && (
                <p className="text-xs text-slate-500">{tr.scale}</p>
            )}
            <p className="text-xs leading-relaxed text-slate-500">
                {teacherTarget
                    ? lang === 'en'
                        ? 'The student’s currently responsible teachers and master administrators can see these answers.'
                        : 'Ikaslearen egungo irakasle arduradunek eta master administratzaileek ikus ditzakete erantzun hauek.'
                    : tr.privacy}
            </p>
            <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed text-slate-600">
                <input
                    name="consent"
                    type="checkbox"
                    required
                    className="mt-1 shrink-0"
                />
                <span>
                    {teacherTarget
                        ? lang === 'en'
                            ? 'I confirm I am entering these answers on the student’s behalf.'
                            : 'Erantzun hauek ikaslearen partez sartzen ari naizela baieztatzen dut.'
                        : tr.consent}
                </span>
            </label>
            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error}
                </p>
            )}
            <button
                type="submit"
                disabled={saving}
                className="teacher-button teacher-button-primary"
            >
                {saving ? tr.sending : tr.send}
            </button>
        </form>
    );
}
