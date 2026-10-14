import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { t, type Language } from '../lib/i18n';
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
    lang?: Language;
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
    variant = 'teal',
    lang = 'eu',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [internalSelected, setInternalSelected] = useState<number[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const selectedIds = value ?? internalSelected;
    const selectedOptions = options.filter((option) =>
        selectedIds.includes(option.id),
    );
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const tr = t(lang).selection;
    const toggleId = `${name}-toggle`,
        listId = `${name}-options`,
        searchId = `${name}-search`;
    useEffect(() => {
        const outside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            )
                setIsOpen(false);
        };
        document.addEventListener('mousedown', outside);
        return () => document.removeEventListener('mousedown', outside);
    }, []);
    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
        else setSearchTerm('');
    }, [isOpen]);
    const update = (ids: number[]) => {
        if (onChange) onChange(ids);
        else setInternalSelected(ids);
    };
    const toggleOption = (option: Option) => {
        if (selectedIds.includes(option.id))
            update(selectedIds.filter((id) => id !== option.id));
        else if (selectedIds.length < maxSelections)
            update([...selectedIds, option.id]);
    };
    const normalize = (str: string) =>
        str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    const available = options.filter(
        (option) =>
            (!excludedIds.includes(option.id) ||
                selectedIds.includes(option.id)) &&
            normalize(option.name).includes(normalize(searchTerm)),
    );
    const colors = {
        teal: {
            tag: 'bg-teal-50 text-teal-700',
            row: 'bg-teal-50 text-teal-700',
        },
        green: {
            tag: 'bg-green-50 text-green-700',
            row: 'bg-green-50 text-green-700',
        },
        red: { tag: 'bg-red-50 text-red-700', row: 'bg-red-50 text-red-700' },
    }[variant];
    return (
        <div
            className="mb-5 relative"
            ref={containerRef}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && isOpen) {
                    event.preventDefault();
                    setIsOpen(false);
                    toggleRef.current?.focus();
                }
            }}
        >
            <label
                htmlFor={toggleId}
                className="mb-2 block text-sm font-bold text-slate-900"
            >
                {label}{' '}
                <span className="text-xs font-normal text-slate-500">
                    · {tr.max} {maxSelections}
                </span>
            </label>
            <div className="survey-selection-field rounded-lg border border-slate-200 bg-white">
                <button
                    ref={toggleRef}
                    id={toggleId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <span>{placeholder}</span>
                    <ChevronDown
                        size={16}
                        className="shrink-0"
                        aria-hidden="true"
                    />
                </button>
                {selectedOptions.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-3 pb-3">
                        {selectedOptions.map((item) => (
                            <span
                                key={item.id}
                                className={`inline-flex max-w-full items-center gap-1 rounded-lg pl-3 text-sm ${colors.tag}`}
                            >
                                <span className="break-words">{item.name}</span>
                                <button
                                    type="button"
                                    aria-label={`${tr.remove}: ${item.name}`}
                                    onClick={() =>
                                        update(
                                            selectedIds.filter(
                                                (id) => id !== item.id,
                                            ),
                                        )
                                    }
                                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg"
                                >
                                    <X size={14} aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
            {isOpen && (
                <div
                    id={listId}
                    className="absolute z-30 mt-2 w-full rounded-xl border border-slate-200 bg-white"
                >
                    <div className="border-b border-slate-100 p-3">
                        <label
                            htmlFor={searchId}
                            className="mb-2 block text-xs text-slate-500"
                        >
                            {tr.search}
                        </label>
                        <input
                            id={searchId}
                            ref={inputRef}
                            type="text"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            value={searchTerm}
                            onChange={(event) =>
                                setSearchTerm(event.target.value)
                            }
                        />
                    </div>
                    <div
                        className="max-h-60 overflow-y-auto py-1"
                        role="group"
                        aria-label={label}
                    >
                        {available.map((option) => {
                            const selected = selectedIds.includes(option.id),
                                full =
                                    selectedIds.length >= maxSelections &&
                                    !selected;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={selected}
                                    disabled={full}
                                    className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 ${selected ? colors.row : 'text-slate-700'}`}
                                    onClick={() => toggleOption(option)}
                                >
                                    <span className="break-words">
                                        {option.name}
                                    </span>
                                    {selected && (
                                        <Check
                                            size={16}
                                            className="shrink-0"
                                            aria-hidden="true"
                                        />
                                    )}
                                </button>
                            );
                        })}
                        {!available.length && (
                            <p className="p-4 text-sm text-slate-500">
                                {tr.none}
                            </p>
                        )}
                    </div>
                </div>
            )}
            <input
                type="hidden"
                name={name}
                value={JSON.stringify(selectedIds)}
            />
        </div>
    );
};
