import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

const page = readFileSync(
    new URL('../../pages/admin/dashboard.astro', import.meta.url),
    'utf8',
);
const { outputText: code } = transpileModule(
    page.match(/<script>([\s\S]*?)<\/script>/)[1],
    {
        compilerOptions: {
            target: ScriptTarget.ES2022,
            module: ModuleKind.ESNext,
        },
    },
);

afterEach(() => vi.useRealTimers());

it.each(['success', 'denied', 'unavailable'])(
    'copies only the project code and handles %s clipboard access',
    async (result) => {
        vi.useFakeTimers();
        const feedback = { textContent: '' };
        const otherFeedback = { textContent: '' };
        const icon = (hidden) => ({
            hidden,
            setAttribute: function () {
                this.hidden = true;
            },
            removeAttribute: function () {
                this.hidden = false;
            },
        });
        const copyIcon = icon(false),
            checkIcon = icon(true);
        const events = {};
        const button = {
            dataset: { accessCode: '1234A' },
            disabled: false,
            querySelector: (selector) =>
                selector === '.copy-feedback'
                    ? feedback
                    : selector === '[data-copy-icon]'
                      ? copyIcon
                      : checkIcon,
            getAttribute: () => 'Kopiatu kodea',
            setAttribute: vi.fn(),
            addEventListener: (name, callback) => {
                events[name] = callback;
            },
        };
        const otherButton = {
            dataset: { accessCode: '5678B' },
            disabled: false,
            querySelector: (selector) =>
                selector === '.copy-feedback' ? otherFeedback : icon(false),
            getAttribute: () => 'Kopiatu beste kodea',
            setAttribute: vi.fn(),
            addEventListener: vi.fn(),
        };
        let finishCopy;
        const writeText = vi.fn(
            () =>
                new Promise((resolve, reject) => {
                    finishCopy =
                        result === 'success'
                            ? resolve
                            : () => reject(new Error('Permission denied'));
                }),
        );
        runInNewContext(code, {
            document: {
                querySelectorAll: (selector) =>
                    selector === '.copy-code-btn' ? [button, otherButton] : [],
                addEventListener: vi.fn(),
            },
            navigator:
                result === 'unavailable' ? {} : { clipboard: { writeText } },
            window: { setTimeout, clearTimeout },
        });

        const copying = events.click();
        if (result !== 'unavailable') {
            expect(writeText).toHaveBeenCalledExactlyOnceWith('1234A');
            expect(button.disabled).toBe(true);
            expect(feedback.textContent).toBe('Kopiatzen…');
            vi.advanceTimersByTime(1500);
            expect(feedback.textContent).toBe('Kopiatzen…');
            finishCopy();
        }
        await copying;
        expect(button.disabled).toBe(false);
        expect(feedback.textContent).toBe(
            result === 'success'
                ? 'Kopiatuta!'
                : 'Ezin izan da kopiatu. Saiatu berriro.',
        );
        expect(copyIcon.hidden).toBe(result === 'success');
        expect(checkIcon.hidden).toBe(result !== 'success');
        expect(button.dataset.accessCode).toBe('1234A');
        expect(otherFeedback.textContent).toBe('');
        expect(otherButton.disabled).toBe(false);
        vi.advanceTimersByTime(1499);
        expect(feedback.textContent).not.toBe('');
        vi.advanceTimersByTime(1);
        expect(feedback.textContent).toBe('');

        expect(copyIcon.hidden).toBe(false);
        expect(checkIcon.hidden).toBe(true);

        // A second click cancels the previous reset while the new copy is pending.
        const secondCopy = events.click();
        if (result !== 'unavailable') finishCopy();
        await secondCopy;
        vi.advanceTimersByTime(1000);
        const thirdCopy = events.click();
        vi.advanceTimersByTime(500);
        if (result !== 'unavailable') {
            expect(feedback.textContent).toBe('Kopiatzen…');
            finishCopy();
        } else {
            expect(feedback.textContent).not.toBe('');
        }
        await thirdCopy;
        vi.advanceTimersByTime(1500);
        expect(feedback.textContent).toBe('');
    },
);
