import React, { useState } from 'react';
import { skillScale } from '../lib/skills';

interface SkillSliderProps {
    label: string;
    name: string;
    min?: number;
    max?: number;
    defaultValue?: number;
    description?: string;
    unknownLabel?: string;
}

export const SkillSlider: React.FC<SkillSliderProps> = ({
    label,
    name,
    min = skillScale.min,
    max = skillScale.max,
    defaultValue = skillScale.defaultValue,
    description,
    unknownLabel,
}) => {
    const [unknown, setUnknown] = useState(false);
    const [value, setValue] = useState(defaultValue);

    return (
        <div className="mb-5">
            <div className="flex justify-between items-start gap-4 mb-1">
                <label
                    htmlFor={name}
                    className="text-sm font-medium text-slate-700"
                >
                    {label}
                </label>
                <output
                    htmlFor={name}
                    className="shrink-0 min-w-8 rounded-lg bg-teal-50 px-2 py-1 text-center text-sm font-semibold text-teal-700"
                >
                    {unknown ? '—' : value}
                </output>
            </div>
            {description && (
                <p className="text-xs text-slate-500 mb-2">{description}</p>
            )}
            <input
                disabled={unknown}
                type="range"
                id={name}
                name={name}
                min={min}
                max={max}
                step={1}
                value={value}
                onChange={(e) => setValue(parseInt(e.target.value))}
                className="skill-range w-full min-h-11 cursor-pointer accent-teal-700"
            />
            {unknownLabel && (
                <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                    <input
                        type="checkbox"
                        checked={unknown}
                        onChange={(event) => setUnknown(event.target.checked)}
                    />
                    {unknownLabel}
                </label>
            )}
            <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>{min}</span>
                <span>{max}</span>
            </div>
        </div>
    );
};
