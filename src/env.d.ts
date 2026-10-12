/// <reference path="../.astro/types.d.ts" />

interface WindowEventMap {
    'student-selected': CustomEvent<{ studentId: number | null }>;
}

declare namespace App {
    interface Locals {
        teacherAccess: import('./lib/access').TeacherAccess;
        teacher: typeof import('../db/schema').users.$inferSelect;
    }
}
