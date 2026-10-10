import { describe, expect, it } from 'vitest';
import { createGraphPoints, stepGraph } from '../graphLayout';
import type { Relationship } from '../tracking';

describe('graph layout', () => {
    it('keeps overlapping and disconnected students finite through settling', () => {
        const points = createGraphPoints([1, 2, 3, 4]);
        points[1].x = points[0].x;
        points[1].y = points[0].y;
        const links: Relationship[] = [{ source: 1, target: 3, kind: 'comfort' }, { source: 1, target: 99, kind: 'preferWith' }];
        for (let i = 0; i < 300; i++) stepGraph(points, links, null, .8);
        expect(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
        expect(Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)).toBeGreaterThan(20);
        expect(points).toHaveLength(4);
    });

    it('keeps the dragged student pinned while connected peers move', () => {
        const points = createGraphPoints([1, 2]);
        points[0].x = 300;
        const start = { x: points[0].x, y: points[0].y };
        const peerX = points[1].x;
        for (let i = 0; i < 50; i++) stepGraph(points, [{ source: 1, target: 2, kind: 'preferWith' }], 1, 1);
        expect({ x: points[0].x, y: points[0].y }).toEqual(start);
        expect(points[1].x).toBeGreaterThan(peerX);
    });

    it('does not pull students together because they prefer to avoid each other', () => {
        const baseline = createGraphPoints([1, 2]);
        const avoid = createGraphPoints([1, 2]);
        for (let i = 0; i < 50; i++) {
            stepGraph(baseline, [], null, 1);
            stepGraph(avoid, [{ source: 1, target: 2, kind: 'preferAvoid' }], null, 1);
        }
        expect(avoid).toEqual(baseline);
    });
});
