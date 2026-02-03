import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

interface Option {
    id: number;
    name: string;
}

interface MultiSelectProps {
    options: Option[];
    name: string;
    maxSelections?: number;
    placeholder?: string;
    label: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
    options,
    name,
    maxSelections = 3,
    placeholder = 'Select students...',
    label
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState<Option[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: Option) => {
        setSelected(prev => {
            const isSelected = prev.some(item => item.id === option.id);
            if (isSelected) {
                return prev.filter(item => item.id !== option.id);
            } else {
                if (prev.length >= maxSelections) return prev;
                return [...prev, option];
            }
        });
    };

    const removeOption = (optionId: number) => {
        setSelected(prev => prev.filter(item => item.id !== optionId));
    };

    return (
        <div className="mb-6" ref={containerRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} {maxSelections && <span className="text-gray-400 font-normal">(Max {maxSelections})</span>}
            </label>

            <div
                className="relative min-h-[42px] w-full border border-gray-300 rounded-md bg-white px-3 py-1 flex flex-wrap gap-1 items-center cursor-pointer shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selected.length === 0 && (
                    <span className="text-gray-400 text-sm">{placeholder}</span>
                )}

                {selected.map(item => (
                    <span
                        key={item.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium"
                    >
                        {item.name}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeOption(item.id); }}
                            className="hover:text-blue-900"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}

                <div className="ml-auto pointer-events-none text-gray-400">
                    <ChevronDown size={16} />
                </div>

                {isOpen && (
                    <div className="absolute z-10 top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {options.map(option => {
                            const isSelected = selected.some(item => item.id === option.id);
                            const isFull = selected.length >= maxSelections && !isSelected;

                            return (
                                <div
                                    key={option.id}
                                    className={`px-3 py-2 flex items-center justify-between hover:bg-gray-50 text-sm ${isSelected ? 'bg-blue-50' : ''} ${isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isFull) toggleOption(option);
                                    }}
                                >
                                    <span className={isSelected ? 'font-medium text-blue-700' : ''}>{option.name}</span>
                                    {isSelected && <Check size={14} className="text-blue-600" />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Hidden input to store selected IDs as JSON for form submission */}
            <input
                type="hidden"
                name={name}
                value={JSON.stringify(selected.map(s => s.id))}
            />
        </div>
    );
};
