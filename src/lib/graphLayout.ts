import type { Relationship } from './tracking';

export interface GraphPoint {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

// Deterministic starting positions keep server rendering and hydration identical.
export function createGraphPoints(ids: number[]): GraphPoint[] {
    return ids.map((id, index) => {
        const angle = index * Math.PI * (3 - Math.sqrt(5));
        const radius = ids.length === 1 ? 0 : 65 * Math.sqrt(index + 1);
        return { id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 };
    });
}

// One bounded physics step: repel nodes, pull connected peers together, retain isolates.
export function stepGraph(points: GraphPoint[], links: Relationship[], pinnedId: number | null, energy: number): void {
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j++) {
            const b = points[j];
            const dx = a.x - b.x || .01 * (i + 1);
            const dy = a.y - b.y || .01 * (j + 1);
            const distance = Math.max(25, Math.hypot(dx, dy));
            const force = Math.min(5, 2600 / (distance * distance)) * energy;
            a.vx += dx / distance * force;
            a.vy += dy / distance * force;
            b.vx -= dx / distance * force;
            b.vy -= dy / distance * force;
        }
    }
    const byId = new Map(points.map(point => [point.id, point]));
    const connected = new Set<string>();
    for (const link of links) {
        if (link.kind === 'preferAvoid') continue;
        const key = `${Math.min(link.source, link.target)}-${Math.max(link.source, link.target)}`;
        if (connected.has(key)) continue;
        connected.add(key);
        const a = byId.get(link.source), b = byId.get(link.target);
        if (!a || !b || a === b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const force = (distance - 125) * .012 * energy;
        a.vx += dx / distance * force;
        a.vy += dy / distance * force;
        b.vx -= dx / distance * force;
        b.vy -= dy / distance * force;
    }
    for (const point of points) {
        if (point.id === pinnedId) { point.vx = 0; point.vy = 0; continue; }
        point.vx = (point.vx - point.x * .0015 * energy) * .78;
        point.vy = (point.vy - point.y * .0015 * energy) * .78;
        point.x += Math.max(-8, Math.min(8, point.vx));
        point.y += Math.max(-8, Math.min(8, point.vy));
    }
}
