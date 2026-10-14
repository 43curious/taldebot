import React, { useState } from 'react';
import { MultiSelect } from './MultiSelect';
import { type Language, t } from '../lib/i18n';

interface Option {
    id: number;
    name: string;
}

interface GroupDynamicsProps {
    options: Option[];
    lang?: Language;
    studentId?: number;
    initialPreferences?: {
        comfort: number[];
        preferWith: number[];
        preferAvoid: number[];
    };
}

export const GroupDynamics: React.FC<GroupDynamicsProps> = ({
    options,
    lang = 'eu',
    studentId,
    initialPreferences,
}) => {
    const [comfort, setComfort] = useState<number[]>(
        initialPreferences?.comfort || [],
    );
    const [preferWith, setPreferWith] = useState<number[]>(
        initialPreferences?.preferWith || [],
    );
    const [preferAvoid, setPreferAvoid] = useState<number[]>(
        initialPreferences?.preferAvoid || [],
    );
    const [selfId, setSelfId] = useState<number | null>(studentId ?? null);

    const tr = t(lang).groupDynamics;

    React.useEffect(() => {
        const handleStudentSelected = (
            e: WindowEventMap['student-selected'],
        ) => {
            setSelfId(e.detail.studentId);

            // Clear selections if they happen to be the selfId (safety check)
            const sid = e.detail.studentId;
            setComfort((prev) => prev.filter((id) => id !== sid));
            setPreferWith((prev) => prev.filter((id) => id !== sid));
            setPreferAvoid((prev) => prev.filter((id) => id !== sid));
        };

        window.addEventListener('student-selected', handleStudentSelected);
        const select =
            document.querySelector<HTMLSelectElement>('#studentSelect');
        if (select?.value) setSelfId(Number(select.value));
        return () =>
            window.removeEventListener(
                'student-selected',
                handleStudentSelected,
            );
    }, []);

    const baseExclusions = selfId !== null ? [selfId] : [];

    return (
        <div className="space-y-6">
            <MultiSelect
                lang={lang}
                options={options}
                name="comfort"
                maxSelections={1}
                label={tr.comfort.label}
                placeholder={tr.comfort.placeholder}
                value={comfort}
                onChange={setComfort}
                excludedIds={[...baseExclusions, ...preferWith, ...preferAvoid]}
                variant="green"
            />

            <MultiSelect
                lang={lang}
                options={options}
                name="preferWith"
                maxSelections={3}
                label={tr.preferWith.label}
                placeholder={tr.preferWith.placeholder}
                value={preferWith}
                onChange={setPreferWith}
                excludedIds={[...baseExclusions, ...comfort, ...preferAvoid]}
                variant="teal"
            />

            <MultiSelect
                lang={lang}
                options={options}
                name="preferAvoid"
                maxSelections={3}
                label={tr.preferAvoid.label}
                placeholder={tr.preferAvoid.placeholder}
                value={preferAvoid}
                onChange={setPreferAvoid}
                excludedIds={[...baseExclusions, ...comfort, ...preferWith]}
                variant="red"
            />
        </div>
    );
};
