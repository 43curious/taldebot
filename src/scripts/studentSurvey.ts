import { language, t } from '../lib/i18n';
import { skillScale } from '../lib/skills';

const form = document.querySelector<HTMLFormElement>('#student-form');
if (form) {
    const tr = t(language(form.dataset.lang));
    const sections = form.querySelectorAll<HTMLElement>(
        'section[id^="section-"]',
    );
    const progressBars = form.querySelectorAll<HTMLElement>(
        '#progress-bar > div',
    );
    const studentSelect =
        form.querySelector<HTMLSelectElement>('#studentSelect')!;
    const emailPrefix = form.querySelector<HTMLInputElement>('#emailPrefix')!;
    const fullEmail = form.querySelector<HTMLInputElement>('#fullEmail')!;
    const terms = form.querySelector<HTMLInputElement>('#terms')!;
    const next = form.querySelector<HTMLButtonElement>('#btn-next-1')!;
    const modal = form.querySelector<HTMLDialogElement>('#disclaimerModal')!;
    const feedback = form.querySelector<HTMLElement>(
        '[data-submission-error]',
    )!;
    let currentSection = '1';

    function validateIdentity() {
        next.disabled =
            !studentSelect.value || !emailPrefix.value.trim() || !terms.checked;
        if (!studentSelect.disabled)
            form!.querySelector<HTMLInputElement>('[name="studentId"]')!.value =
                studentSelect.value;
        fullEmail.value = `${emailPrefix.value.trim()}@alumni.mondragon.edu`;
        window.dispatchEvent(
            new CustomEvent('student-selected', {
                detail: {
                    studentId: studentSelect.value
                        ? Number(studentSelect.value)
                        : null,
                },
            }),
        );
    }

    function showSection(id: string) {
        currentSection = id;
        sections.forEach((section) => {
            section.hidden = section.id !== `section-${id}`;
        });
        form!.querySelector('#progress-bar')!.setAttribute('aria-valuenow', id);
        form!
            .querySelector('#progress-bar')!
            .setAttribute('aria-valuetext', `${id} / 4`);
        form!.querySelector<HTMLElement>('[data-progress-label]')!.textContent =
            `${id} / 4 · ${tr.surveyUi.step}`;
        form!
            .querySelector<HTMLElement>(`#section-heading-${id}`)
            ?.focus({ preventScroll: true });
        const description = form!.querySelector<HTMLElement>(
            `#section-description-${id}`,
        );
        if (description)
            description.textContent =
                tr.sectionDescriptions[
                    id as keyof typeof tr.sectionDescriptions
                ] || '';
        progressBars.forEach((bar, index) => {
            bar.classList.toggle('bg-teal-600', index < Number(id));
            bar.classList.toggle('bg-slate-200', index >= Number(id));
        });
        window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'auto'
                : 'smooth',
        });
    }

    form.querySelectorAll<HTMLButtonElement>('[data-next]').forEach(
        (button) => {
            button.addEventListener('click', () => {
                if (currentSection === '1' && next.disabled) return;
                if (currentSection === '2') {
                    const empty = [
                        'comfort',
                        'preferWith',
                        'preferAvoid',
                    ].every(
                        (name) =>
                            form.querySelector<HTMLInputElement>(
                                `[name="${name}"]`,
                            )?.value === '[]',
                    );
                    if (empty && !window.confirm(tr.form.confirmEmptyDynamics))
                        return;
                }
                if (currentSection === '3') {
                    const unchanged = [
                        ...form.querySelectorAll<HTMLInputElement>(
                            'input[type="range"]',
                        ),
                    ].every(
                        (slider) =>
                            Number(slider.value) === skillScale.defaultValue,
                    );
                    if (
                        unchanged &&
                        !window.confirm(tr.form.confirmDefaultSkills)
                    )
                        return;
                }
                if (button.dataset.next) showSection(button.dataset.next);
            });
        },
    );
    form.querySelectorAll<HTMLButtonElement>('[data-prev]').forEach(
        (button) => {
            button.addEventListener('click', () => {
                if (button.dataset.prev) showSection(button.dataset.prev);
            });
        },
    );
    studentSelect.addEventListener('change', validateIdentity);
    emailPrefix.addEventListener('input', validateIdentity);
    terms.addEventListener('change', validateIdentity);
    form.querySelector('#openDisclaimer')?.addEventListener('click', () =>
        modal.showModal(),
    );
    form.querySelector('#closeDisclaimer')?.addEventListener('click', () =>
        modal.close(),
    );
    modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.close();
    });

    // Preserve #2: Enter never implicitly submits from an earlier section.
    form.addEventListener('keydown', (event) => {
        if (
            event.key === 'Enter' &&
            !(event.target instanceof HTMLButtonElement)
        )
            event.preventDefault();
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (currentSection !== '4') return;
        const button = form.querySelector<HTMLButtonElement>(
            'button[type="submit"]',
        )!;
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = tr.form.submitting;
        feedback.hidden = true;
        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
            });
            if (form!.dataset.mode === 'trial') {
                const result = await response.json();
                if (!response.ok || !result.success)
                    throw new Error('Trial validation failed');
                form!.hidden = true;
                const completed =
                    document.querySelector<HTMLElement>('#trial-complete')!;
                completed.hidden = false;
                completed.focus();
                return;
            }
            if (!response.ok || !response.redirected)
                throw new Error('Submission failed');
            window.location.assign(response.url);
        } catch {
            feedback.textContent = tr.form.submissionError;
            feedback.hidden = false;
            feedback.focus();
            button.disabled = false;
            button.textContent = tr.form.submit;
        }
    });
    validateIdentity();
    showSection('1');
}
