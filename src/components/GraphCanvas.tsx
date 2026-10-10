import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { createGraphPoints, stepGraph } from '../lib/graphLayout';
import type { GraphPoint } from '../lib/graphLayout';
import type { GraphStudent } from '../lib/studentReport';
import { graphStudentName } from '../lib/studentReport';
import type { Relationship } from '../lib/tracking';

export const graphColors = { positive: '#16a34a', negative: '#dc2626' };
export interface GraphHandle { fit(): void; zoom(factor: number): void }
interface Props {
    students: GraphStudent[];
    relationships: Relationship[];
    edges: Relationship[];
    selectedId: number | null;
    matchingIds: Set<number>;
    onSelect(id: number | null): void;
}
interface Camera { x: number; y: number; zoom: number }
const edgeKey = (edge: Relationship) => `${edge.source}-${edge.target}-${edge.kind}`;
const clampZoom = (zoom: number) => Math.max(.2, Math.min(3, zoom));

// React owns selection and accessibility. Continuous motion writes only SVG geometry.
const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas({ students, relationships, edges, selectedId, matchingIds, onSelect }, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const worldRef = useRef<SVGGElement>(null);
    const nodeRefs = useRef(new Map<number, SVGGElement>());
    const glyphRefs = useRef(new Map<number, SVGGElement>());
    const edgeRefs = useRef(new Map<string, SVGPathElement>());
    const points = useMemo(() => createGraphPoints(students.map(student => student.id)), [students]);
    const initialPoints = useMemo(() => new Map(points.map(point => [point.id, { x: point.x, y: point.y }])), [points]);
    const displayEdges = useRef(edges);
    const selectCallback = useRef(onSelect);
    displayEdges.current = edges;
    selectCallback.current = onSelect;
    const engine = useRef<GraphHandle & { select(id: number | null): void; redraw(): void } | null>(null);
    useImperativeHandle(ref, () => ({ fit: () => engine.current?.fit(), zoom: factor => engine.current?.zoom(factor) }), []);

    useEffect(() => {
        const svg = svgRef.current, world = worldRef.current;
        if (!svg || !world) return;
        const byId = new Map(points.map(point => [point.id, point]));
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const rect = svg.getBoundingClientRect();
        let size = { width: rect.width, height: rect.height };
        let camera: Camera = { x: 0, y: 0, zoom: 1 };
        let tween: { from: Camera; to: Camera; start: number } | null = null;
        let selection: number | null = null;
        let gesture: { pointerId: number; point?: GraphPoint; startX: number; startY: number; x: number; y: number; moved: boolean } | null = null;
        let frame = 0, last = 0, energy = motion.matches ? 0 : .8;
        let dirty = true, geometryDirty = true, paintedZoom = 0;
        let resizeTimer: ReturnType<typeof setTimeout>;
        for (let i = 0; i < 40; i++) stepGraph(points, relationships, null, .8);

        function paint() {
            world!.setAttribute('transform', `translate(${size.width / 2 + camera.x} ${size.height / 2 + camera.y}) scale(${camera.zoom})`);
            if (geometryDirty) {
                for (const point of points) nodeRefs.current.get(point.id)?.setAttribute('transform', `translate(${point.x} ${point.y})`);
                for (const edge of displayEdges.current) {
                    const a = byId.get(edge.source), b = byId.get(edge.target);
                    if (a && b) edgeRefs.current.get(edgeKey(edge))?.setAttribute('d', `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
                }
                geometryDirty = false;
            }
            if (camera.zoom !== paintedZoom) {
                for (const glyph of glyphRefs.current.values()) glyph.setAttribute('transform', `scale(${1 / camera.zoom})`);
                paintedZoom = camera.zoom;
            }
            dirty = false;
        }
        function wake(geometry = false) {
            dirty = true;
            geometryDirty ||= geometry;
            if (!frame) frame = requestAnimationFrame(tick);
        }
        function tick(now: number) {
            frame = 0;
            const elapsed = last ? Math.min(2, (now - last) / 16.67) : 1;
            last = now;
            if (energy > .015 && !motion.matches) {
                stepGraph(points, relationships, gesture?.point?.id ?? selection, energy * elapsed * .5);
                energy *= Math.pow(.985, elapsed);
                dirty = geometryDirty = true;
            }
            if (tween) {
                const progress = Math.min(1, (now - tween.start) / 260);
                const eased = 1 - Math.pow(1 - progress, 3);
                camera = {
                    x: tween.from.x + (tween.to.x - tween.from.x) * eased,
                    y: tween.from.y + (tween.to.y - tween.from.y) * eased,
                    zoom: tween.from.zoom + (tween.to.zoom - tween.from.zoom) * eased,
                };
                if (progress === 1) tween = null;
                dirty = true;
            }
            if (dirty) paint();
            if (energy > .015 && !motion.matches || tween || dirty) frame = requestAnimationFrame(tick);
            else last = 0;
        }
        function moveCamera(next: Camera, animate = false) {
            tween = animate && !motion.matches ? { from: { ...camera }, to: next, start: performance.now() } : null;
            if (!tween) camera = next;
            wake();
        }
        function focus(point: GraphPoint, animate = true) {
            const mobile = size.width < 640;
            const reportWidth = Math.min(440, Math.max(360, window.innerWidth * .34));
            const visibleWidth = Math.max(120, size.width - reportWidth - 60);
            const zoom = Math.max(camera.zoom, mobile ? 1.1 : 1.75);
            moveCamera({ zoom, x: (mobile ? 0 : visibleWidth / 2 - size.width / 2) - point.x * zoom, y: (mobile ? -size.height * .30 : 0) - point.y * zoom }, animate);
        }
        function fit() {
            if (!points.length || !size.width || !size.height) return;
            const selectedPoint = selection === null ? undefined : byId.get(selection);
            if (selectedPoint) { focus(selectedPoint, false); return; }
            const xs = points.map(point => point.x), ys = points.map(point => point.y);
            const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
            const zoom = Math.min(1.3, clampZoom(Math.min((size.width - 110) / (right - left + 100), (size.height - 140) / (bottom - top + 100))));
            moveCamera({ zoom, x: -(left + right) / 2 * zoom, y: -(top + bottom) / 2 * zoom });
        }
        function zoomAt(factor: number, x = 0, y = 0) {
            const zoom = clampZoom(camera.zoom * factor), ratio = zoom / camera.zoom;
            moveCamera({ zoom, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio });
        }
        function pointerDown(event: PointerEvent) {
            if (event.button !== 0 || gesture) return;
            const target = event.target instanceof Element ? event.target.closest('[data-student-id]') : null;
            const point = target ? byId.get(Number(target.getAttribute('data-student-id'))) : undefined;
            gesture = { pointerId: event.pointerId, point, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
            tween = null;
            svg!.setPointerCapture(event.pointerId);
        }
        function pointerMove(event: PointerEvent) {
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) gesture.moved = true;
            if (!gesture.moved) return;
            svg!.classList.add('is-dragging');
            const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
            if (gesture.point) {
                gesture.point.x += dx / camera.zoom; gesture.point.y += dy / camera.zoom;
                gesture.point.vx = gesture.point.vy = 0;
                energy = motion.matches ? 0 : .5;
                wake(true);
            } else {
                camera.x += dx; camera.y += dy;
                wake();
            }
            gesture.x = event.clientX; gesture.y = event.clientY;
        }
        function pointerEnd(event: PointerEvent) {
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            const active = gesture;
            gesture = null;
            svg!.classList.remove('is-dragging');
            if (svg!.hasPointerCapture(event.pointerId)) svg!.releasePointerCapture(event.pointerId);
            if (event.type === 'pointerup' && !active.moved) {
                const id = active.point?.id ?? null;
                selectCallback.current(id === selection ? null : id);
            }
        }
        function wheel(event: WheelEvent) {
            event.preventDefault();
            const bounds = svg!.getBoundingClientRect();
            zoomAt(Math.exp(-event.deltaY * .002), event.clientX - bounds.left - size.width / 2, event.clientY - bounds.top - size.height / 2);
        }
        function doubleClick(event: MouseEvent) { if (event.target === svg) { selection = null; selectCallback.current(null); fit(); } }
        function motionChange() { if (motion.matches) { energy = 0; if (tween) { camera = tween.to; tween = null; } } wake(); }
        const observer = new ResizeObserver(([entry]) => {
            size = { width: entry.contentRect.width, height: entry.contentRect.height };
            wake();
            clearTimeout(resizeTimer);
            if (size.width > 44 && size.height > 44) resizeTimer = setTimeout(fit, 120);
        });
        observer.observe(svg);
        svg.addEventListener('pointerdown', pointerDown);
        svg.addEventListener('pointermove', pointerMove);
        svg.addEventListener('pointerup', pointerEnd);
        svg.addEventListener('pointercancel', pointerEnd);
        svg.addEventListener('lostpointercapture', pointerEnd);
        svg.addEventListener('wheel', wheel, { passive: false });
        svg.addEventListener('dblclick', doubleClick);
        motion.addEventListener('change', motionChange);
        engine.current = {
            fit: () => { selection = null; selectCallback.current(null); fit(); },
            zoom: factor => zoomAt(factor),
            select: id => { selection = id; const point = id === null ? undefined : byId.get(id); if (point) focus(point); else fit(); },
            redraw: () => wake(true),
        };
        fit();
        return () => {
            cancelAnimationFrame(frame); clearTimeout(resizeTimer); observer.disconnect();
            svg.removeEventListener('pointerdown', pointerDown); svg.removeEventListener('pointermove', pointerMove);
            svg.removeEventListener('pointerup', pointerEnd); svg.removeEventListener('pointercancel', pointerEnd);
            svg.removeEventListener('lostpointercapture', pointerEnd); svg.removeEventListener('wheel', wheel);
            svg.removeEventListener('dblclick', doubleClick); motion.removeEventListener('change', motionChange);
            engine.current = null;
        };
    }, [points, relationships]);

    useEffect(() => { engine.current?.select(selectedId); }, [selectedId, points, relationships]);
    useEffect(() => { engine.current?.redraw(); }, [edges]);
    const connectedIds = new Set(edges.flatMap(edge => [edge.source, edge.target]));
    return <svg ref={svgRef} className="graph-canvas" width="100%" height="100%" role="group" aria-label="Ikasleen harremanak. Arrastatu mapa mugitzeko; erabili zoom-kontrolak hurbiltzeko.">
        <g ref={worldRef} data-graph-world="">
            {edges.map(edge => {
                const a = initialPoints.get(edge.source), b = initialPoints.get(edge.target);
                if (!a || !b) return null;
                return <path key={edgeKey(edge)} ref={element => { if (element) edgeRefs.current.set(edgeKey(edge), element); else edgeRefs.current.delete(edgeKey(edge)); }}
                    d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} fill="none" stroke={edge.kind === 'preferAvoid' ? graphColors.negative : graphColors.positive}
                    strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeDasharray={edge.kind === 'preferAvoid' ? '4 5' : undefined}
                    opacity=".9" pointerEvents="none" />;
            })}
            {students.map(student => {
                const point = initialPoints.get(student.id)!;
                const selected = student.id === selectedId;
                const dimmed = selectedId === null ? !matchingIds.has(student.id) : !selected && !connectedIds.has(student.id);
                return <g key={student.id} ref={element => { if (element) nodeRefs.current.set(student.id, element); else nodeRefs.current.delete(student.id); }} className="graph-node" data-student-id={student.id} transform={`translate(${point.x} ${point.y})`}
                    role="button" tabIndex={0} aria-label={student.name} aria-pressed={selected} style={{ opacity: dimmed ? .17 : 1 }}
                    onClick={event => { if (event.detail === 0) onSelect(selected ? null : student.id); }} onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(selected ? null : student.id); }
                    }}>
                    <title>{student.name}</title>
                    <g ref={element => { if (element) glyphRefs.current.set(student.id, element); else glyphRefs.current.delete(student.id); }}>
                        <circle className="graph-node-focus" r="15" fill="none" stroke="#0f766e" strokeWidth="1.5" opacity={selected ? 1 : 0} />
                        <circle r="22" fill="transparent" />
                        <circle r={selected ? 9 : 7} fill={selected ? '#0f766e' : student.hasCompleted ? '#64748b' : '#f8fafc'} stroke={selected ? '#0f766e' : '#94a3b8'} strokeWidth="1.5" />
                        <text y="26" textAnchor="middle" fill={selected ? '#0f766e' : '#475569'} fontSize="12" fontWeight={selected ? 600 : 400}>{graphStudentName(student.name)}</text>
                    </g>
                </g>;
            })}
        </g>
    </svg>;
});
export default GraphCanvas;
