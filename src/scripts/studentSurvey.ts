import { language, t } from '../lib/i18n';
import { skillScale } from '../lib/skills';

const form = document.querySelector<HTMLFormElement>('#student-form');
if (form) {
    const tr = t(language(form.dataset.lang));
    const sections = form.querySelectorAll<HTMLElement>('section');
    const progressBars = form.querySelectorAll<HTMLElement>(
        '#progress-bar > div',
    );
    const studentSelect =
        form.querySelector<HTMLSelectElement>('#studentSelect')!;
    const emailPrefix = form.querySelector<HTMLInputElement>('#emailPrefix')!;
    const fullEmail = form.querySelector<HTMLInputElement>('#fullEmail')!;
    const terms = form.querySelector<HTMLInputElement>('#terms')!;
    const next = form.querySelector<HTMLButtonElement>('#btn-next-1')!;
    const modal = form.querySelector<HTMLElement>('#disclaimerModal')!;
    const feedback = form.querySelector<HTMLElement>(
        '[data-submission-error]',
    )!;
    let currentSection = '1';

    function validateIdentity() {
        next.disabled =
            !studentSelect.value || !emailPrefix.value.trim() || !terms.checked;
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
        sections.forEach((section) =>
            section.classList.toggle('hidden', section.id !== `section-${id}`),
        );
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
        modal.classList.remove('hidden'),
    );
    form.querySelector('#closeDisclaimer')?.addEventListener('click', () =>
        modal.classList.add('hidden'),
    );
    modal.addEventListener('click', (event) => {
        if (
            event.target === modal ||
            (event.target instanceof Element &&
                event.target.classList.contains('bg-black/50'))
        )
            modal.classList.add('hidden');
    });

    // Preserve #2: Enter never implicitly submits from an earlier section.
    form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
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
            if (!response.ok || !response.redirected)
                throw new Error('Submission failed');
            window.location.assign(response.url);
        } catch {
            feedback.textContent = tr.form.submissionError;
            feedback.hidden = false;
            button.disabled = false;
            button.textContent = tr.form.submit;
        }
    });
    validateIdentity();
    showSection('1');
}
