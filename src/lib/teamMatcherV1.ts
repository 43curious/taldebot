import type { StudentData, Team } from "./teamMatcher";

export function createTeamsV1(
    students: StudentData[],
    numTeams: number,
    projectType: string,
    history: Array<{ student1Id: number; student2Id: number }>
): Team[] {
    const totalStudents = students.length;
    const baseSize = Math.floor(totalStudents / numTeams);
    const extraStudents = totalStudents % numTeams;

    const teamSizes = Array(numTeams)
        .fill(baseSize)
        .map((size, i) => (i < extraStudents ? size + 1 : size));

    const teams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
        teamNumber: i + 1,
        memberIds: [],
        members: [],
        justification: "",
    }));

    const sortedStudents = [...students].sort((a, b) => {
        if (a.isExcluded && !b.isExcluded) return 1;
        if (!a.isExcluded && b.isExcluded) return -1;

        const constraintsA =
            a.preferAvoid.length +
            history.filter((h) => h.student1Id === a.id || h.student2Id === a.id)
                .length;
        const constraintsB =
            b.preferAvoid.length +
            history.filter((h) => h.student1Id === b.id || h.student2Id === b.id)
                .length;
        return constraintsB - constraintsA;
    });

    for (const student of sortedStudents) {
        let bestTeamIdx = -1;
        let maxScore = -Infinity;
        const teamScores: { index: number; score: number; reasons: string[] }[] =
            [];

        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            if (team.memberIds.length >= teamSizes[i]) continue;

            // Keep omitted/excluded students separated whenever there is any feasible alternative team.
            if (student.isExcluded) {
                const teamHasExcluded = team.members.some((m) => m.isExcluded);
                const hasAlternativeTeam = teams.some((candidateTeam, candidateIdx) => {
                    if (candidateIdx === i) return false;
                    if (candidateTeam.memberIds.length >= teamSizes[candidateIdx]) return false;
                    return !candidateTeam.members.some((m) => m.isExcluded);
                });
                if (teamHasExcluded && hasAlternativeTeam) continue;
            }

            let score = 0;
            const reasons: string[] = [];

            const hasAvoid = team.members.some(
                (m) =>
                    student.preferAvoid.includes(m.id) ||
                    m.preferAvoid.includes(student.id)
            );
            if (hasAvoid) {
                score = -10000;
                reasons.push("Hard constraint: preferAvoid violation");
            } else {
                for (const member of team.members) {
                    const workedBefore = history.some(
                        (h) =>
                            (h.student1Id === student.id &&
                                h.student2Id === member.id) ||
                            (h.student1Id === member.id &&
                                h.student2Id === student.id)
                    );
                    if (workedBefore) {
                        score -= 50;
                        reasons.push(
                            `History penalty: worked with ${member.name} before`
                        );
                    }
                }

                for (const member of team.members) {
                    if (student.preferWith.includes(member.id)) {
                        score += 30;
                        reasons.push(
                            `Preference bonus: wants to work with ${member.name}`
                        );
                    }
                    if (member.preferWith.includes(student.id)) {
                        score += 30;
                        reasons.push(
                            `Preference bonus: ${member.name} wants to work with student`
                        );
                    }
                }

                const categories: (keyof StudentData["skills"])[] = [
                    "skillsNarrative",
                    "skillsTechnical",
                    "skillsManagement",
                ];
                for (const cat of categories) {
                    const skillSet = student.skills[cat];
                    const teamSkills = team.members.map((m) => m.skills[cat]);

                    let weight = 1;
                    const shortCat = cat.replace("skills", "").toLowerCase();
                    if (projectType === shortCat) weight = 2;
                    else if (projectType === "balanced") weight = 1;
                    else weight = 0.5;

                    for (const skillName in skillSet) {
                        const val = (skillSet as any)[skillName];
                        const teamVals = teamSkills.map((ts) => (ts as any)[skillName]);
                        const teamMax = teamVals.length > 0 ? Math.max(...teamVals) : 0;
                        const teamAvg =
                            teamVals.length > 0
                                ? teamVals.reduce((a, b) => a + b, 0) / teamVals.length
                                : 0;

                        if (teamMax < 8 && val > 7) {
                            score += 40 * weight;
                            reasons.push(
                                `Skill balance (${skillName}): adds high performer`
                            );
                        }
                        if (teamVals.length > 0 && teamVals.every((v) => v > 7) && val < 5) {
                            score += 20 * weight;
                            reasons.push(
                                `Skill balance (${skillName}): adds diversity to high performers`
                            );
                        }
                        if (teamVals.length > 0 && teamAvg < 5 && val > 6) {
                            score += 25 * weight;
                            reasons.push(
                                `Skill balance (${skillName}): improves low average`
                            );
                        }
                    }
                }

                const teamLeaders = team.members.filter(
                    (m) => m.skills.skillsSoft.leadership > 7
                ).length;
                if (teamLeaders > 2 && student.skills.skillsSoft.leadership > 7) {
                    score -= 30;
                    reasons.push("Soft skills: Too many leaders");
                }

                const hasMotivator = team.members.some(
                    (m) => m.skills.skillsSoft.motivation > 6
                );
                if (!hasMotivator && student.skills.skillsSoft.motivation > 6) {
                    score += 20;
                    reasons.push("Soft skills: Adds motivator");
                }

                const hasMediator = team.members.some(
                    (m) => m.skills.skillsSoft.conflict > 6
                );
                if (!hasMediator && student.skills.skillsSoft.conflict > 6) {
                    score += 15;
                    reasons.push("Soft skills: Adds mediator");
                }

                if (student.isExcluded) {
                    const excludedCount = team.members.filter((m) => m.isExcluded).length;
                    if (excludedCount > 0) {
                        score -= 500 * excludedCount;
                        reasons.push(
                            `Absent distribution: Already has ${excludedCount} absent student(s)`
                        );
                    } else {
                        score += 50;
                        reasons.push("Absent distribution: First absent student in team");
                    }
                }

                const comfortMatches = team.members.filter((m) =>
                    student.comfort.includes(m.id)
                ).length;
                if (comfortMatches === 0) {
                    score -= 500;
                    reasons.push("Comfort Zone: Isolation penalty (0 known members)");
                } else if (comfortMatches === 1) {
                    score += 100;
                    reasons.push(
                        "Comfort Zone: Anchorage success (1 known member, ideal for expansion)"
                    );
                } else if (comfortMatches >= 2) {
                    score -= 50;
                    reasons.push(
                        `Comfort Zone: Overlap penalty (${comfortMatches} known members)`
                    );
                }
            }

            teamScores.push({ index: i, score, reasons });
            if (score > maxScore) {
                maxScore = score;
                bestTeamIdx = i;
            }
        }

        if (bestTeamIdx !== -1) {
            const bestTeam = teams[bestTeamIdx];
            const result = teamScores.find((ts) => ts.index === bestTeamIdx);
            bestTeam.memberIds.push(student.id);
            bestTeam.members.push(student);
            bestTeam.justification += `${student.name} assigned: ${
                result?.reasons.join(", ") || "No specific reasons"
            }.\n`;
        }
    }

    for (const team of teams) {
        const avgSkills = calculateAvgSkills(team.members);
        team.justification =
            `Team ${team.teamNumber} summary: ${Object.entries(avgSkills)
                .map(([cat, val]) => `${cat}: ${val.toFixed(1)}`)
                .join(", ")}.\n\n` + team.justification;
    }

    return teams;
}

function calculateAvgSkills(members: StudentData[]) {
    if (members.length === 0) return {};
    const totals: Record<string, number> = {
        narrative: 0,
        technical: 0,
        management: 0,
        soft: 0,
    };
    for (const m of members) {
        totals.narrative +=
            Object.values(m.skills.skillsNarrative).reduce((a, b) => a + b, 0) / 4;
        totals.technical +=
            Object.values(m.skills.skillsTechnical).reduce((a, b) => a + b, 0) / 3;
        totals.management +=
            Object.values(m.skills.skillsManagement).reduce((a, b) => a + b, 0) / 2;
        totals.soft +=
            Object.values(m.skills.skillsSoft).reduce((a, b) => a + b, 0) / 6;
    }
    return {
        narrative: totals.narrative / members.length,
        technical: totals.technical / members.length,
        management: totals.management / members.length,
        soft: totals.soft / members.length,
    };
}
