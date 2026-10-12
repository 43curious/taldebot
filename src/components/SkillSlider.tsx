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
        <div className="mb-6">
            <div className="flex justify-between items-center mb-1">
                <label
                    htmlFor={name}
                    className="text-sm font-medium text-slate-700"
                >
                    {label}
                </label>
                <span className="text-teal-600 font-bold text-lg">
                    {unknown ? '—' : value}
                </span>
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
                value={value}
                onChange={(e) => setValue(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
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
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>{min}</span>
                <span>{max}</span>
            </div>
        </div>
    );
};
