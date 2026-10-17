import { language, studentPath } from '../lib/i18n';

const form = document.querySelector<HTMLFormElement>('#project-code-form');
if (form) {
    const inputs = [...form.querySelectorAll<HTMLInputElement>('.otp-input')];
    const button = form.querySelector<HTMLButtonElement>('#hasi-button')!;
    const error = form.querySelector<HTMLElement>('#error-message')!;
    const lang = language(form.dataset.lang);
    const refresh = () => {
        inputs.forEach((input) =>
            input.classList.toggle('filled', Boolean(input.value)),
        );
        button.disabled = !/^\d{4}[A-Z]$/.test(
            inputs.map((input) => input.value).join(''),
        );
    };
    const location = new URL(window.location.href);
    if (location.searchParams.get('error') === 'not_found') {
        error.hidden = false;
        location.searchParams.delete('error');
        window.history.replaceState(
            {},
            '',
            location.pathname + location.search,
        );
    }
    inputs.forEach((input, index) => {
        input.addEventListener('focus', () => input.select());
        input.addEventListener('input', () => {
            error.hidden = true;
            const value = input.value.toUpperCase();
            input.value = (index < 4 ? /^[0-9]$/ : /^[A-Z]$/).test(value)
                ? value
                : '';
            refresh();
            if (input.value && index < 4) inputs[index + 1].focus();
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Backspace' && !input.value && index > 0) {
                event.preventDefault();
                inputs[index - 1].value = '';
                inputs[index - 1].focus();
                refresh();
            } else if (event.key === 'ArrowLeft' && index > 0) {
                event.preventDefault();
                inputs[index - 1].focus();
            } else if (event.key === 'ArrowRight' && index < 4) {
                event.preventDefault();
                inputs[index + 1].focus();
            }
        });
        input.addEventListener('paste', (event) => {
            const value =
                event.clipboardData
                    ?.getData('text')
                    .replace(/[\s–—-]/g, '')
                    .toUpperCase() ?? '';
            event.preventDefault();
            if (/^\d{4}[A-Z]$/.test(value)) {
                inputs.forEach((field, i) => {
                    field.value = value[i];
                });
                inputs[4].focus();
            } else {
                const allowed = index < 4 ? /^\d+$/ : /^[A-Z]$/;
                if (!allowed.test(value)) return;
                const limit = index < 4 ? 4 : 5;
                for (
                    let i = index;
                    i < Math.min(limit, index + value.length);
                    i++
                )
                    inputs[i].value = value[i - index];
                inputs[Math.min(4, index + value.length)].focus();
            }
            error.hidden = true;
            refresh();
        });
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        refresh();
        if (!button.disabled)
            window.location.assign(
                studentPath(
                    lang,
                    `/student/form/${inputs.map((input) => input.value).join('')}`,
                ),
            );
    });
    refresh();
}
document
    .querySelector<HTMLSelectElement>('#lang-selector')
    ?.addEventListener('change', (event) => {
        const target = event.currentTarget as HTMLSelectElement;
        window.location.assign(studentPath(language(target.value)));
    });
