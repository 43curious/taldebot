import React, { useState } from 'react';

interface SkillSliderProps {
    label: string;
    name: string;
    min?: number;
    max?: number;
    defaultValue?: number;
    description?: string;
}

export const SkillSlider: React.FC<SkillSliderProps> = ({
    label,
    name,
    min = 1,
    max = 10,
    defaultValue = 5,
    description
}) => {
    const [value, setValue] = useState(defaultValue);

    return (
        <div className="mb-6">
            <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-slate-700">{label}</label>
                <span className="text-teal-600 font-bold text-lg">{value}</span>
            </div>
            {description && <p className="text-xs text-slate-500 mb-2">{description}</p>}
            <input
                type="range"
                name={name}
                min={min}
                max={max}
                value={value}
                onChange={(e) => setValue(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>{min}</span>
                <span>{max}</span>
            </div>
        </div>
    );
};
