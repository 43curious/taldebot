interface KnowledgeContext {
    projectName: string | null;
    academicPeriod: string;
    collectionYear?: number | null;
}
// A survey's collection year stays historical when the current enrollment moves.
export function knowledgeSourceLabel(record: KnowledgeContext) {
    return [
        record.projectName,
        record.academicPeriod === 'legacy'
            ? 'Ikasturte ezezaguna'
            : record.academicPeriod,
        record.collectionYear ? `${record.collectionYear}. mailan jasoa` : null,
    ]
        .filter(Boolean)
        .join(' · ');
}

export function projectSourceLabel(project: {
    name: string;
    academicPeriod: string | null;
    collectionYear: number | null;
}) {
    return knowledgeSourceLabel({
        projectName: project.name,
        academicPeriod: project.academicPeriod ?? 'legacy',
        collectionYear: project.collectionYear,
    });
}
