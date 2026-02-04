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
    value?: number[];
    onChange?: (ids: number[]) => void;
    excludedIds?: number[];
    variant?: 'teal' | 'green' | 'red';
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
    options,
    name,
    maxSelections = 3,
    placeholder = 'Hautatu ikasleak...',
    label,
    value,
    onChange,
    excludedIds = [],
    variant = 'teal'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [internalSelected, setInternalSelected] = useState<Option[]>([]);

    // Use controlled value if provided, otherwise use internal state
    const selectedIds = value !== undefined ? value : internalSelected.map(s => s.id);
    const selectedOptions = options.filter(o => selectedIds.includes(o.id));

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
        const isSelected = selectedIds.includes(option.id);
        let newIds: number[];

        if (isSelected) {
            newIds = selectedIds.filter(id => id !== option.id);
        } else {
            if (selectedIds.length >= maxSelections) return;
            newIds = [...selectedIds, option.id];
        }

        if (onChange) {
            onChange(newIds);
        } else {
            setInternalSelected(options.filter(o => newIds.includes(o.id)));
        }
    };

    const removeOption = (optionId: number) => {
        const newIds = selectedIds.filter(id => id !== optionId);
        if (onChange) {
            onChange(newIds);
        } else {
            setInternalSelected(options.filter(o => newIds.includes(o.id)));
        }
    };

    // Filter out options that are selected in OTHER components (excludedIds)
    // but keep those already selected in THIS component so they can be unselected.
    const availableOptions = options.filter(option =>
        !excludedIds.includes(option.id) || selectedIds.includes(option.id)
    );

    const variantStyles = {
        teal: {
            tag: "bg-teal-100 text-teal-700",
            item: "bg-teal-50 text-teal-700",
            check: "text-teal-600",
            ring: "focus-within:ring-teal-500 focus-within:border-teal-500"
        },
        green: {
            tag: "bg-green-100 text-green-700",
            item: "bg-green-50 text-green-700",
            check: "text-green-600",
            ring: "focus-within:ring-green-500 focus-within:border-green-500"
        },
        red: {
            tag: "bg-red-100 text-red-700",
            item: "bg-red-50 text-red-700",
            check: "text-red-600",
            ring: "focus-within:ring-red-500 focus-within:border-red-500"
        }
    };

    const style = variantStyles[variant];

    return (
        <div className="mb-6" ref={containerRef}>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                {label} {maxSelections && <span className="text-slate-300 font-normal">(Gehien. {maxSelections})</span>}
            </label>

            <div
                className={`relative min-h-[42px] w-full border border-slate-200 rounded-2xl bg-slate-50/50 px-4 py-2 flex flex-wrap gap-2 items-center cursor-pointer transition-all ${style.ring}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedOptions.length === 0 && (
                    <span className="text-gray-400 text-sm">{placeholder}</span>
                )}

                {selectedOptions.map(item => (
                    <span
                        key={item.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.tag}`}
                    >
                        {item.name}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeOption(item.id); }}
                            className="hover:opacity-75"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}

                <div className="ml-auto pointer-events-none text-slate-300">
                    <ChevronDown size={16} />
                </div>

                {isOpen && (
                    <div className="absolute z-10 top-full left-0 w-full mt-3 bg-white border border-slate-100 rounded-2xl shadow-2xl shadow-slate-200/50 max-h-60 overflow-y-auto overflow-hidden">
                        {availableOptions.map(option => {
                            const isSelected = selectedIds.includes(option.id);
                            const isFull = selectedIds.length >= maxSelections && !isSelected;

                            return (
                                <div
                                    key={option.id}
                                    className={`px-3 py-2 flex items-center justify-between hover:bg-gray-50 text-sm ${isSelected ? style.item : ''} ${isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isFull) toggleOption(option);
                                    }}
                                >
                                    <span className={isSelected ? 'font-medium' : ''}>{option.name}</span>
                                    {isSelected && <Check size={14} className={style.check} />}
                                </div>
                            );
                        })}
                        {availableOptions.length === 0 && (
                            <div className="px-3 py-4 text-center text-gray-400 text-sm">
                                Aukerarik ez dago
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Hidden input to store selected IDs as JSON for form submission */}
            <input
                type="hidden"
                name={name}
                value={JSON.stringify(selectedIds)}
            />
        </div>
    );
};
