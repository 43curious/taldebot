import { useState, type SyntheticEvent } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { standardQuestions, type Question } from '../lib/questionnaires';

interface Props {
    id?: number;
    initialName: string;
    initialQuestions: Question[];
}
export default function QuestionnaireEditor({
    id,
    initialName,
    initialQuestions,
}: Props) {
    const [name, setName] = useState(initialName);
    const [questions, setQuestions] = useState(() => [
        ...initialQuestions,
        ...standardQuestions().filter(
            (q) => !initialQuestions.some((item) => item.key === q.key),
        ),
    ]);
    const [enabled, setEnabled] = useState(
        () => new Set(initialQuestions.map((q) => q.key)),
    );
    const [error, setError] = useState(''),
        [saving, setSaving] = useState(false);
    const edit = (
        index: number,
        field: 'label' | 'explanation',
        lang: 'eu' | 'en',
        value: string,
    ) =>
        setQuestions((rows) =>
            rows.map((q, i) =>
                i === index
                    ? { ...q, [field]: { ...q[field], [lang]: value } }
                    : q,
            ),
        );
    const move = (index: number, delta: number) =>
        setQuestions((rows) => {
            const next = [...rows];
            [next[index], next[index + delta]] = [
                next[index + delta],
                next[index],
            ];
            return next;
        });
    async function save(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/admin/questionnaires', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    name,
                    questions: questions.filter((q) => enabled.has(q.key)),
                }),
            });
            const result = await response.json();
            if (!response.ok)
                throw new Error(
                    result.error || 'Ezin izan da galdera-sorta gorde.',
                );
            window.location.assign(
                `/admin/questionnaires?id=${result.questionnaireId}&saved=1`,
            );
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Ezin izan da gorde.',
            );
            setSaving(false);
        }
    }
    return (
        <form onSubmit={save} className="questionnaire-editor space-y-5">
            <label className="teacher-label">
                Galdera-sortaren izena
                <input
                    name="name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                />
            </label>
            <p className="text-sm leading-relaxed text-slate-500">
                Aukeratu galderak eta ordenatu geziekin. Irekita dagoen inkesta
                baten bertsioa mantentzen da; aldaketak bertsio berri batean
                gordeko dira. Gaitasunen esanahia eta 1–10 eskala mantendu
                testua editatzean.
            </p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {questions.map((question, index) => (
                    <div key={question.key} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800">
                                <input
                                    type="checkbox"
                                    checked={enabled.has(question.key)}
                                    onChange={() =>
                                        setEnabled((previous) => {
                                            const next = new Set(previous);
                                            if (next.has(question.key))
                                                next.delete(question.key);
                                            else next.add(question.key);
                                            return next;
                                        })
                                    }
                                />
                                {question.label.eu ||
                                    standardQuestions().find(
                                        (q) => q.key === question.key,
                                    )?.label.eu}
                            </label>
                            <div className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    className="teacher-button p-2"
                                    aria-label={`${question.label.eu}: gora`}
                                    disabled={index === 0}
                                    onClick={() => move(index, -1)}
                                >
                                    <ArrowUp size={16} />
                                </button>
                                <button
                                    type="button"
                                    className="teacher-button p-2"
                                    aria-label={`${question.label.eu}: behera`}
                                    disabled={index === questions.length - 1}
                                    onClick={() => move(index, 1)}
                                >
                                    <ArrowDown size={16} />
                                </button>
                            </div>
                        </div>
                        <p className="ml-7 text-xs text-slate-500">
                            {question.type === 'skill'
                                ? 'Autoebaluazioa · 1–10'
                                : question.type === 'preference'
                                  ? `Kideen hautaketa · gehienez ${question.key === 'comfort' ? 1 : 3}`
                                  : 'Benetako elkarlana · bai / inoiz ez / erantzunik gabe'}
                            {question.key === 'soft_motivation'
                                ? ' · Proiektuarekin bakarrik'
                                : ''}
                        </p>
                        {enabled.has(question.key) && (
                            <details className="ml-7 mt-2">
                                <summary className="flex min-h-11 cursor-pointer items-center text-sm text-teal-700">
                                    Testua editatu · Euskara / English
                                </summary>
                                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                    {(['eu', 'en'] as const).map((lang) => (
                                        <div key={lang} className="space-y-3">
                                            <label className="teacher-label">
                                                {lang === 'eu'
                                                    ? 'Izenburua · Euskara'
                                                    : 'Title · English'}
                                                <input
                                                    required
                                                    maxLength={500}
                                                    value={question.label[lang]}
                                                    onChange={(event) =>
                                                        edit(
                                                            index,
                                                            'label',
                                                            lang,
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label className="teacher-label">
                                                {lang === 'eu'
                                                    ? 'Azalpena · Euskara'
                                                    : 'Explanation · English'}
                                                <textarea
                                                    rows={3}
                                                    maxLength={3000}
                                                    value={
                                                        question.explanation[
                                                            lang
                                                        ]
                                                    }
                                                    onChange={(event) =>
                                                        edit(
                                                            index,
                                                            'explanation',
                                                            lang,
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                ))}
            </div>
            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error}
                </p>
            )}
            <button
                disabled={saving || enabled.size === 0}
                className="teacher-button teacher-button-primary"
                type="submit"
            >
                {saving ? 'Gordetzen…' : 'Galdera-sorta gorde'}
            </button>
        </form>
    );
}
