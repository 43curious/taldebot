export interface StudentData {
    id: number;
    name: string;
    skills: {
        skillsNarrative: { creativity: number; writing: number; references: number; communication: number };
        skillsTechnical: { camera: number; sound: number; editing: number };
        skillsManagement: { planning: number; production: number };
        skillsSoft: { leadership: number; listening: number; proactivity: number; teamwork: number; motivation: number; conflict: number };
    };
    preferWith: number[];
    preferAvoid: number[];
    comfort: number[];
    isExcluded: boolean;
}

export interface Team {
    teamNumber: number;
    memberIds: number[];
    members: StudentData[];
    justification: string;
}

export function createTeams(
    students: StudentData[],
    numTeams: number,
    projectType: string,
    history: Array<{ student1Id: number; student2Id: number }>
): Team[] {
    // 1. Calculate team size distribution
    const totalStudents = students.length;
    const baseSize = Math.floor(totalStudents / numTeams);
    const extraStudents = totalStudents % numTeams;

    const teamSizes = Array(numTeams).fill(baseSize).map((size, i) => (i < extraStudents ? size + 1 : size));

    const teams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
        teamNumber: i + 1,
        memberIds: [],
        members: [],
        justification: "",
    }));

    // 2. Sort students by constraint level (most restricted first)
    const sortedStudents = [...students].sort((a, b) => {
        // Excluded students are processed last to fill gaps
        if (a.isExcluded && !b.isExcluded) return 1;
        if (!a.isExcluded && b.isExcluded) return -1;

        // Calculate constraint scores
        // 1. History (already worked together)
        const histA = history.filter(h => h.student1Id === a.id || h.student2Id === a.id).length;
        const histB = history.filter(h => h.student1Id === b.id || h.student2Id === b.id).length;

        // 2. Avoidances (how many people they want to avoid AND how many people avoid them)
        const avoidOutA = a.preferAvoid.length;
        const avoidOutB = b.preferAvoid.length;
        const avoidInA = students.filter(s => s.preferAvoid.includes(a.id)).length;
        const avoidInB = students.filter(s => s.preferAvoid.includes(b.id)).length;

        const scoreA = histA + avoidOutA + avoidInA;
        const scoreB = histB + avoidOutB + avoidInB;

        return scoreB - scoreA;
    });

    // 3. For each student, calculate compatibility score with each existing team
    for (const student of sortedStudents) {
        let bestTeamIdx = -1;
        let maxScore = -Infinity;
        const teamScores: { index: number; score: number; reasons: string[] }[] = [];

        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            if (team.memberIds.length >= teamSizes[i]) continue;

            // Keep omitted/excluded students separated whenever there is any feasible alternative team.
            if (student.isExcluded) {
                const teamHasExcluded = team.members.some(m => m.isExcluded);
                const hasAlternativeTeam = teams.some((candidateTeam, candidateIdx) => {
                    if (candidateIdx === i) return false;
                    if (candidateTeam.memberIds.length >= teamSizes[candidateIdx]) return false;
                    return !candidateTeam.members.some(m => m.isExcluded);
                });
                if (teamHasExcluded && hasAlternativeTeam) continue;
            }

            let score = 0;
            const reasons: string[] = [];

            // SOFT CONSTRAINT: AVOID PREFERENCES
            // Instead of hard constraint, penalize but don't make impossible
            let avoidPenalty = 0;
            for (const member of team.members) {
                if (student.preferAvoid.includes(member.id)) {
                    avoidPenalty -= 300;
                    reasons.push(`Avoid penalty: student wants to avoid ${member.name}`);
                }
                if (member.preferAvoid.includes(student.id)) {
                    avoidPenalty -= 300;
                    reasons.push(`Avoid penalty: ${member.name} wants to avoid student`);
                }
            }
            score += avoidPenalty;

            // RENEGADE DISTRIBUTION
            // Count how many times this student is avoided by ALL students
            const timesAvoided = students.filter(s => s.preferAvoid.includes(student.id)).length;
            const RENEGADE_THRESHOLD = 3;
            if (timesAvoided >= RENEGADE_THRESHOLD) {
                // This student is frequently avoided - distribute them
                const renegadesInTeam = team.members.filter(m =>
                    students.filter(s => s.preferAvoid.includes(m.id)).length >= RENEGADE_THRESHOLD
                ).length;
                if (renegadesInTeam > 0) {
                    score -= 400;
                    reasons.push(`Renegade distribution: team already has ${renegadesInTeam} frequently-avoided student(s)`);
                }
            }

            // HISTORY PENALTY
            for (const member of team.members) {
                const workedBefore = history.some(
                    h => (h.student1Id === student.id && h.student2Id === member.id) ||
                        (h.student1Id === member.id && h.student2Id === student.id)
                );
                if (workedBefore) {
                    score -= 50;
                    reasons.push(`History penalty: worked with ${member.name} before`);
                }
            }

            // PREFERENCE BONUS (preferWith)
            for (const member of team.members) {
                if (student.preferWith.includes(member.id)) {
                    score += 30;
                    reasons.push(`Preference bonus: wants to work with ${member.name}`);
                }
                if (member.preferWith.includes(student.id)) {
                    score += 30;
                    reasons.push(`Preference bonus: ${member.name} wants to work with student`);
                }
            }

            // SKILL BALANCE
            const categories: (keyof StudentData['skills'])[] = ['skillsNarrative', 'skillsTechnical', 'skillsManagement'];
            for (const cat of categories) {
                const skillSet = student.skills[cat];
                const teamSkills = team.members.map(m => m.skills[cat]);

                // Weighting based on projectType
                let weight = 1;
                const shortCat = cat.replace('skills', '').toLowerCase();
                if (projectType === shortCat) weight = 2;
                else if (projectType === 'balanced') weight = 1;
                else weight = 0.5;

                for (const skillName in skillSet) {
                    const val = (skillSet as any)[skillName];
                    const teamVals = teamSkills.map(ts => (ts as any)[skillName]);
                    const teamMax = teamVals.length > 0 ? Math.max(...teamVals) : 0;
                    const teamAvg = teamVals.length > 0 ? teamVals.reduce((a, b) => a + b, 0) / teamVals.length : 0;

                    if (teamMax < 8 && val > 7) {
                        score += 40 * weight;
                        reasons.push(`Skill balance (${skillName}): adds high performer`);
                    }
                    if (teamVals.length > 0 && teamVals.every(v => v > 7) && val < 5) {
                        score += 20 * weight;
                        reasons.push(`Skill balance (${skillName}): adds diversity to high performers`);
                    }
                    if (teamVals.length > 0 && teamAvg < 5 && val > 6) {
                        score += 25 * weight;
                        reasons.push(`Skill balance (${skillName}): improves low average`);
                    }
                }
            }

            // SOFT SKILLS BALANCE
            const teamLeaders = team.members.filter(m => m.skills.skillsSoft.leadership > 7).length;
            if (teamLeaders > 2 && student.skills.skillsSoft.leadership > 7) {
                score -= 30;
                reasons.push("Soft skills: Too many leaders");
            }

            const hasMotivator = team.members.some(m => m.skills.skillsSoft.motivation > 6);
            if (!hasMotivator && student.skills.skillsSoft.motivation > 6) {
                score += 20;
                reasons.push("Soft skills: Adds motivator");
            }

            const hasMediator = team.members.some(m => m.skills.skillsSoft.conflict > 6);
            if (!hasMediator && student.skills.skillsSoft.conflict > 6) {
                score += 15;
                reasons.push("Soft skills: Adds mediator");
            }

            // ABSENT/EXCLUDED DISTRIBUTION
            if (student.isExcluded) {
                const excludedCount = team.members.filter(m => m.isExcluded).length;
                if (excludedCount > 0) {
                    score -= 500 * excludedCount;
                    reasons.push(`Absent distribution: Already has ${excludedCount} absent student(s)`);
                } else {
                    score += 50;
                    reasons.push("Absent distribution: First absent student in team");
                }
            }

            // ANCHOR PERSON (simplified comfort zone)
            // With maxSelections=1, comfort is now just the anchor person
            const hasAnchor = team.members.some(m => student.comfort.includes(m.id));
            const isAnchorForOther = team.members.some(m => m.comfort.includes(student.id));

            if (hasAnchor) {
                score += 150; // Strong bonus for having your anchor in team
                reasons.push("Anchor Person: Student's anchor is in this team");
            }
            if (isAnchorForOther) {
                score += 100; // Bonus for being someone's anchor
                reasons.push("Anchor Person: Student is anchor for team member");
            }

            // SPACE BONUS
            // Prevent greedy team filling by giving a bonus to teams with fewer members
            const remainingSpace = teamSizes[i] - team.memberIds.length;
            score += remainingSpace * 20;
            // reasons.push(`Space bonus: ${remainingSpace} spots left`); // Too verbose for final justification

            teamScores.push({ index: i, score, reasons });
            if (score > maxScore) {
                maxScore = score;
                bestTeamIdx = i;
            }
        }

        // 4. Assign student to team with highest score
        if (bestTeamIdx !== -1) {
            const bestTeam = teams[bestTeamIdx];
            const result = teamScores.find(ts => ts.index === bestTeamIdx);
            bestTeam.memberIds.push(student.id);
            bestTeam.members.push(student);
            bestTeam.justification += `${student.name} assigned: ${result?.reasons.join(', ') || 'No specific reasons'}.\n`;
        }
    }

    // Final cleanup of justification for each team
    for (const team of teams) {
        const avgSkills = calculateAvgSkills(team.members);
        team.justification = `Team ${team.teamNumber} summary: ${Object.entries(avgSkills).map(([cat, val]) => `${cat}: ${val.toFixed(1)}`).join(', ')}.\n\n` + team.justification;
    }

    return teams;
}

function calculateAvgSkills(members: StudentData[]) {
    if (members.length === 0) return {};
    const totals: Record<string, number> = { narrative: 0, technical: 0, management: 0, soft: 0 };
    for (const m of members) {
        totals.narrative += Object.values(m.skills.skillsNarrative).reduce((a, b) => a + b, 0) / 4;
        totals.technical += Object.values(m.skills.skillsTechnical).reduce((a, b) => a + b, 0) / 3;
        totals.management += Object.values(m.skills.skillsManagement).reduce((a, b) => a + b, 0) / 2;
        totals.soft += Object.values(m.skills.skillsSoft).reduce((a, b) => a + b, 0) / 6;
    }
    return {
        narrative: totals.narrative / members.length,
        technical: totals.technical / members.length,
        management: totals.management / members.length,
        soft: totals.soft / members.length,
    };
}
