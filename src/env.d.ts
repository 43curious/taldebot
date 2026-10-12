/// <reference path="../.astro/types.d.ts" />

interface WindowEventMap {
    'student-selected': CustomEvent<{ studentId: number | null }>;
}
