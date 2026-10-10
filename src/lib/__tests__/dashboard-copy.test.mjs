import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { afterEach, expect, it, vi } from 'vitest';

const page = readFileSync(new URL('../../pages/admin/dashboard.astro', import.meta.url), 'utf8');
const { code } = await transform(page.match(/<script>([\s\S]*?)<\/script>/)[1], { loader: 'ts' });

afterEach(() => vi.useRealTimers());

it.each(['success', 'denied', 'unavailable'])('copies only the project code and handles %s clipboard access', async (result) => {
    vi.useFakeTimers();
    const feedback = { textContent: 'Kopiatu' };
    const otherFeedback = { textContent: 'Kopiatu' };
    const events = {};
    const button = {
        dataset: { accessCode: '1234A' }, disabled: false,
        querySelector: () => feedback,
        addEventListener: (name, callback) => { events[name] = callback; },
    };
    const otherButton = {
        dataset: { accessCode: '5678B' }, disabled: false,
        querySelector: () => otherFeedback,
        addEventListener: vi.fn(),
    };
    let finishCopy;
    const writeText = vi.fn(() => new Promise((resolve, reject) => {
        finishCopy = result === 'success' ? resolve : () => reject(new Error('Permission denied'));
    }));
    runInNewContext(code, {
        document: { querySelectorAll: (selector) => selector === '.copy-code-btn' ? [button, otherButton] : [] },
        navigator: result === 'unavailable' ? {} : { clipboard: { writeText } },
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
    expect(feedback.textContent).toBe(result === 'success' ? 'Kopiatuta!' : 'Ezin izan da kopiatu. Saiatu berriro.');
    expect(button.dataset.accessCode).toBe('1234A');
    expect(otherFeedback.textContent).toBe('Kopiatu');
    expect(otherButton.disabled).toBe(false);
    vi.advanceTimersByTime(1499);
    expect(feedback.textContent).not.toBe('Kopiatu');
    vi.advanceTimersByTime(1);
    expect(feedback.textContent).toBe('Kopiatu');

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
        expect(feedback.textContent).not.toBe('Kopiatu');
    }
    await thirdCopy;
    vi.advanceTimersByTime(1500);
    expect(feedback.textContent).toBe('Kopiatu');
});
