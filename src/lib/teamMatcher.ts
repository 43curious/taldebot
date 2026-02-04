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

        const constraintsA = a.preferAvoid.length + history.filter(h => h.student1Id === a.id || h.student2Id === a.id).length;
        const constraintsB = b.preferAvoid.length + history.filter(h => h.student1Id === b.id || h.student2Id === b.id).length;
        return constraintsB - constraintsA;
    });

    // 3. For each student, calculate compatibility score with each existing team
    for (const student of sortedStudents) {
        let bestTeamIdx = -1;
        let maxScore = -Infinity;
        const teamScores: { index: number; score: number; reasons: string[] }[] = [];

        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            if (team.memberIds.length >= teamSizes[i]) continue;

            let score = 0;
            const reasons: string[] = [];

            // HARD CONSTRAINTS
            const hasAvoid = team.members.some(m => student.preferAvoid.includes(m.id) || m.preferAvoid.includes(student.id));
            if (hasAvoid) {
                score = -10000;
                reasons.push("Hard constraint: preferAvoid violation");
            } else {
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

                // PREFERENCE BONUS
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
                // Penalty for each excluded student already in the team to ensure distribution
                if (student.isExcluded) {
                    const excludedCount = team.members.filter(m => m.isExcluded).length;
                    if (excludedCount > 0) {
                        score -= 500 * excludedCount;
                        reasons.push(`Absent distribution: Already has ${excludedCount} absent student(s)`);
                    } else {
                        score += 50; // Slight preference to being the first absent student in a team
                        reasons.push("Absent distribution: First absent student in team");
                    }
                }

                // COMFORT ZONE INVERSE FILTER
                const comfortMatches = team.members.filter(m => student.comfort.includes(m.id)).length;
                if (comfortMatches === 0) {
                    score -= 500; // PESO_AISLAMIENTO
                    reasons.push("Comfort Zone: Isolation penalty (0 known members)");
                } else if (comfortMatches === 1) {
                    score += 100; // PESO_ANCLAJE
                    reasons.push("Comfort Zone: Anchorage success (1 known member, ideal for expansion)");
                } else if (comfortMatches >= 2) {
                    score -= 50;  // PESO_EXCESO
                    reasons.push(`Comfort Zone: Overlap penalty (${comfortMatches} known members)`);
                }
            }

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
