import React, { useState } from 'react';
import { MultiSelect } from './MultiSelect';

interface Option {
    id: number;
    name: string;
}

interface GroupDynamicsProps {
    options: Option[];
}

export const GroupDynamics: React.FC<GroupDynamicsProps> = ({ options }) => {
    const [comfort, setComfort] = useState<number[]>([]);
    const [preferWith, setPreferWith] = useState<number[]>([]);
    const [preferAvoid, setPreferAvoid] = useState<number[]>([]);
    const [selfId, setSelfId] = useState<number | null>(null);

    React.useEffect(() => {
        const handleStudentSelected = (e: any) => {
            setSelfId(e.detail.studentId);

            // Clear selections if they happen to be the selfId (safety check)
            const sid = e.detail.studentId;
            setComfort(prev => prev.filter(id => id !== sid));
            setPreferWith(prev => prev.filter(id => id !== sid));
            setPreferAvoid(prev => prev.filter(id => id !== sid));
        };

        window.addEventListener('student-selected', handleStudentSelected);
        return () => window.removeEventListener('student-selected', handleStudentSelected);
    }, []);

    const baseExclusions = selfId !== null ? [selfId] : [];

    return (
        <div className="space-y-6">
            <MultiSelect
                options={options}
                name="comfort"
                maxSelections={6}
                label="Konfort-Zona"
                placeholder="Norekin sentitzen zara erosoen lanean?"
                value={comfort}
                onChange={setComfort}
                excludedIds={[...baseExclusions, ...preferWith, ...preferAvoid]}
                variant="green"
            />

            <MultiSelect
                options={options}
                name="preferWith"
                maxSelections={3}
                label="Elkarlan Berriak"
                placeholder="Norekin ez duzu oraindik lanik egin eta gustatuko litzaizuke proiektu honetan lan egitea??"
                value={preferWith}
                onChange={setPreferWith}
                excludedIds={[...baseExclusions, ...comfort, ...preferAvoid]}
                variant="teal"
            />

            <MultiSelect
                options={options}
                name="preferAvoid"
                maxSelections={3}
                label="Mugak"
                placeholder="Zein kide nahiago zenuke proiektu honetan saihestea?"
                value={preferAvoid}
                onChange={setPreferAvoid}
                excludedIds={[...baseExclusions, ...comfort, ...preferWith]}
                variant="red"
            />
        </div>
    );
};
