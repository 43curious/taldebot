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

    // If I choose someone in my comfort zone, they cannot be in preferWith or preferAvoid
    // Basically, any selected ID is excluded from OTHER categories.

    return (
        <div className="space-y-6">
            <MultiSelect
                options={options}
                name="comfort"
                maxSelections={6}
                label="Konfiantza Zirkulua"
                placeholder="Norekin sentitzen zara erosoen lanean?"
                value={comfort}
                onChange={setComfort}
                excludedIds={[...preferWith, ...preferAvoid]}
                variant="green"
            />

            <MultiSelect
                options={options}
                name="preferWith"
                maxSelections={3}
                label="Elkarlan Berriak"
                placeholder="Norekin gustatuko litzaizuke proiektu honetan lan egitea?"
                value={preferWith}
                onChange={setPreferWith}
                excludedIds={[...comfort, ...preferAvoid]}
                variant="teal"
            />

            <MultiSelect
                options={options}
                name="preferAvoid"
                maxSelections={3}
                label="Mugak"
                placeholder="Norekin nahiko zenuke EZ lan egin?"
                value={preferAvoid}
                onChange={setPreferAvoid}
                excludedIds={[...comfort, ...preferWith]}
                variant="red"
            />
        </div>
    );
};
