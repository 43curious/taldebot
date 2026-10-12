import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Scan, Search, SlidersHorizontal, X } from 'lucide-react';
import GraphCanvas, { graphColors } from './GraphCanvas';
import type { GraphHandle } from './GraphCanvas';
import type { Relationship, RelationshipKind } from '../lib/tracking';
import type { GraphStudent } from '../lib/studentReport';
import { assessmentGroups } from '../lib/studentReport';
import './ClassGraph.css';

interface Props {
    students: GraphStudent[];
    relationships: Relationship[];
    fullScreen?: boolean;
    sourceLabel?: string;
    noSurvey?: boolean;
}
const kinds: Record<RelationshipKind, { label: string; color: string }> = {
    comfort: { label: 'Konfort-zona', color: graphColors.positive },
    preferWith: { label: 'Elkarrekin lan egin', color: graphColors.positive },
    preferAvoid: {
        label: 'Ikaslearen saiheste-hobespena',
        color: graphColors.negative,
    },
    restriction: {
        label: 'Derrigorrezko bereizketa',
        color: graphColors.negative,
    },
};

export default function ClassGraph({
    students,
    relationships,
    fullScreen = false,
    sourceLabel,
    noSurvey = false,
}: Props) {
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [kind, setKind] = useState<RelationshipKind | 'positive' | 'all'>(
        'all',
    );
    const [search, setSearch] = useState('');
    const [toolsOpen, setToolsOpen] = useState(false);
    const canvasRef = useRef<GraphHandle>(null);
    const controlId = useId().replace(/:/g, '');
    const studentMap = useMemo(
        () => new Map(students.map((student) => [student.id, student])),
        [students],
    );
    const selected =
        selectedId === null ? undefined : studentMap.get(selectedId);
    const edges = useMemo(
        () =>
            selectedId === null
                ? []
                : relationships.filter(
                      (edge) =>
                          (edge.source === selectedId ||
                              edge.target === selectedId) &&
                          (kind === 'all' ||
                              (kind === 'positive'
                                  ? edge.kind !== 'preferAvoid' &&
                                    edge.kind !== 'restriction'
                                  : edge.kind === kind)),
                  ),
        [relationships, kind, selectedId],
    );
    const matchingIds = useMemo(
        () =>
            new Set(
                students
                    .filter((student) =>
                        student.name
                            .toLocaleLowerCase('eu')
                            .includes(search.trim().toLocaleLowerCase('eu')),
                    )
                    .map((student) => student.id),
            ),
        [students, search],
    );
    const reportEdges = selected?.profile?.relationships || relationships;
    const outgoing = reportEdges.filter((edge) => edge.source === selectedId);
    const incoming = reportEdges.filter((edge) => edge.target === selectedId);
    const preferred = outgoing.filter(
        (edge) => edge.kind !== 'preferAvoid' && edge.kind !== 'restriction',
    );
    const avoided = outgoing.filter(
        (edge) => edge.kind === 'preferAvoid' || edge.kind === 'restriction',
    );

    useEffect(() => {
        function escape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setSelectedId(null);
                setToolsOpen(false);
            }
        }
        document.addEventListener('keydown', escape);
        return () => document.removeEventListener('keydown', escape);
    }, []);

    return (
        <div
            className={`class-graph ${fullScreen ? 'class-graph-full' : 'class-graph-embedded'}`}
            role="region"
            aria-label="Klasearen harremanen mapa"
        >
            <GraphCanvas
                ref={canvasRef}
                students={students}
                relationships={relationships}
                edges={edges}
                selectedId={selectedId}
                matchingIds={matchingIds}
                onSelect={setSelectedId}
            />
            {!students.length && (
                <div className="graph-empty">
                    <p>Ez dago ikasle aktiborik mapa erakusteko.</p>
                </div>
            )}
            {students.length > 0 && (
                <>
                    <div className="graph-tools">
                        <button
                            type="button"
                            className="graph-icon-button graph-surface"
                            aria-label="Mapa iragazi"
                            aria-expanded={toolsOpen}
                            aria-controls={`${controlId}-tools`}
                            onClick={() => setToolsOpen((value) => !value)}
                        >
                            <SlidersHorizontal size={17} />
                        </button>
                        {toolsOpen && (
                            <div
                                id={`${controlId}-tools`}
                                className="graph-tool-panel graph-surface"
                            >
                                <div className="teacher-label">
                                    <label
                                        htmlFor={`${controlId}-search`}
                                        className="flex items-center gap-2"
                                    >
                                        <Search size={13} /> Bilatu ikaslea
                                    </label>
                                    <input
                                        id={`${controlId}-search`}
                                        type="search"
                                        value={search}
                                        onChange={(event) =>
                                            setSearch(event.target.value)
                                        }
                                        placeholder="Ikaslearen izena"
                                    />
                                </div>
                                {search && (
                                    <div className="graph-search-results">
                                        {students
                                            .filter((student) =>
                                                matchingIds.has(student.id),
                                            )
                                            .map((student) => (
                                                <button
                                                    type="button"
                                                    key={student.id}
                                                    onClick={() => {
                                                        setSelectedId(
                                                            student.id,
                                                        );
                                                        setSearch('');
                                                        setToolsOpen(false);
                                                    }}
                                                >
                                                    {student.name}
                                                </button>
                                            ))}
                                        {!matchingIds.size && (
                                            <p role="status">
                                                Ez da ikaslerik aurkitu.
                                            </p>
                                        )}
                                    </div>
                                )}
                                <div className="teacher-label">
                                    <label htmlFor={`${controlId}-kind`}>
                                        Harremanak
                                    </label>
                                    <select
                                        id={`${controlId}-kind`}
                                        value={kind}
                                        onChange={(event) =>
                                            setKind(
                                                event.target
                                                    .value as typeof kind,
                                            )
                                        }
                                    >
                                        <option value="all">Guztiak</option>
                                        <option value="positive">
                                            Lan-hobespenak
                                        </option>
                                        <option value="comfort">
                                            Konfort-zona
                                        </option>
                                        <option value="preferWith">
                                            Elkarrekin lan egin
                                        </option>
                                        <option value="preferAvoid">
                                            Saihestu
                                        </option>
                                        <option value="restriction">
                                            Derrigorrezko murrizketak
                                        </option>
                                    </select>
                                </div>
                                <p className="text-xs leading-relaxed text-slate-400">
                                    Irakaslearentzako informazio pribatua.
                                </p>
                            </div>
                        )}
                    </div>
                    <div
                        className="graph-zoom graph-surface"
                        aria-label="Maparen zooma"
                    >
                        <button
                            type="button"
                            className="graph-icon-button"
                            aria-label="Hurbildu"
                            onClick={() => canvasRef.current?.zoom(1.25)}
                        >
                            <Plus size={17} />
                        </button>
                        <button
                            type="button"
                            className="graph-icon-button"
                            aria-label="Urrundu"
                            onClick={() => canvasRef.current?.zoom(0.8)}
                        >
                            <Minus size={17} />
                        </button>
                        <button
                            type="button"
                            className="graph-icon-button"
                            aria-label="Mapa egokitu"
                            onClick={() => canvasRef.current?.fit()}
                        >
                            <Scan size={16} />
                        </button>
                    </div>
                    <div className="graph-caption">
                        <p>
                            {students.length} ikasle
                            {sourceLabel && ` · ${sourceLabel}`}
                        </p>
                        <p>
                            {noSurvey
                                ? 'Klase honetako inkesta-daturik ez dago oraindik. Eskatu ikasleei eguneratzea beren jarraipen-fitxatik.'
                                : relationships.length
                                  ? 'Klik egin ikasle batean fokua jartzeko'
                                  : 'Ez dago harreman-daturik oraindik.'}
                        </p>
                        {selected && (
                            <div className="graph-legend">
                                <span>
                                    <i
                                        style={{
                                            background: graphColors.positive,
                                        }}
                                    />
                                    Hobespenak / Konfort-zona
                                </span>
                                <span>
                                    <i
                                        style={{
                                            background: graphColors.negative,
                                        }}
                                    />
                                    Saihestu / Bereizi
                                </span>
                            </div>
                        )}
                    </div>
                </>
            )}
            <span className="sr-only" role="status">
                {selected
                    ? `${selected.name}: ikaslearen txostena irekita.`
                    : ''}
            </span>
            {selected && (
                <aside
                    className="graph-report graph-surface"
                    aria-label={`${selected.name}: ikaslearen txostena`}
                >
                    <div className="graph-report-heading">
                        <div className="min-w-0">
                            <p className="text-xs text-slate-400">
                                Ikaslearen txostena
                            </p>
                            <h2 className="mt-1 text-lg leading-snug text-slate-900">
                                {selected.name}
                            </h2>
                        </div>
                        <button
                            type="button"
                            className="graph-icon-button"
                            onClick={() => setSelectedId(null)}
                            aria-label="Txostena itxi"
                        >
                            <X size={17} />
                        </button>
                    </div>
                    <div className="graph-report-body">
                        {selected.profile && (
                            <p className="mb-3 text-xs text-slate-500">
                                {selected.profile.label}
                                <br />
                                {selected.profile.assessmentAt
                                    ? new Date(
                                          selected.profile.assessmentAt,
                                      ).toLocaleDateString('eu-ES')
                                    : 'Data ezezaguna'}{' '}
                                ·{' '}
                                {selected.profile.assessmentSource ||
                                    'Autoebaluaziorik gabe'}
                            </p>
                        )}
                        <p
                            className={`text-xs ${selected.hasCompleted ? 'text-teal-700' : 'text-slate-500'}`}
                        >
                            {selected.profile
                                ? selected.assessment
                                    ? 'Datatutako autoebaluazioa'
                                    : 'Autoebaluaziorik gabe'
                                : selected.hasSurvey === false
                                  ? 'Inkesta-daturik gabe'
                                  : selected.hasCompleted
                                    ? 'Inkesta osatuta'
                                    : 'Oraindik ez du inkesta bete.'}
                        </p>
                        {(selected.email ||
                            selected.tutor ||
                            selected.division) && (
                            <dl className="graph-student-details">
                                {selected.email && (
                                    <>
                                        <dt>Emaila</dt>
                                        <dd>{selected.email}</dd>
                                    </>
                                )}
                                {selected.tutor && (
                                    <>
                                        <dt>Tutorea</dt>
                                        <dd>{selected.tutor}</dd>
                                    </>
                                )}
                                {selected.division && (
                                    <>
                                        <dt>Adarra</dt>
                                        <dd>
                                            {selected.division === 'digitala'
                                                ? 'Digitala'
                                                : 'Sormena'}
                                        </dd>
                                    </>
                                )}
                            </dl>
                        )}
                        <div className="graph-report-counts">
                            <div>
                                <strong>
                                    {
                                        new Set(
                                            preferred.map(
                                                (edge) => edge.target,
                                            ),
                                        ).size
                                    }
                                </strong>
                                <span>Hobespenak</span>
                            </div>
                            <div>
                                <strong>
                                    {
                                        new Set(
                                            avoided.map((edge) => edge.target),
                                        ).size
                                    }
                                </strong>
                                <span>Saiheste-hobespenak / bereizketak</span>
                            </div>
                            <div>
                                <strong>
                                    {
                                        new Set(
                                            incoming.map((edge) => edge.source),
                                        ).size
                                    }
                                </strong>
                                <span>Sarrerako loturak</span>
                            </div>
                        </div>
                        <section
                            className="graph-assessment"
                            aria-label="Autoebaluazioa"
                        >
                            <h3>Autoebaluazioa</h3>
                            <p className="graph-assessment-note">
                                Ikasleak bere buruari emandako puntuazioa · 1–10
                            </p>
                            {selected.assessment ? (
                                assessmentGroups(selected.assessment).map(
                                    (group) => (
                                        <div
                                            className="graph-skill-group"
                                            key={group.label}
                                        >
                                            <h4>{group.label}</h4>
                                            <dl>
                                                {group.skills
                                                    .filter(
                                                        (skill) =>
                                                            !selected.profile ||
                                                            selected.profile
                                                                .motivationInContext ||
                                                            skill.key !==
                                                                'motivation',
                                                    )
                                                    .map((skill) => (
                                                        <div
                                                            className="graph-skill-row"
                                                            key={skill.key}
                                                        >
                                                            <dt>
                                                                {skill.label}
                                                            </dt>
                                                            <dd>
                                                                {skill.score ===
                                                                null ? (
                                                                    <span
                                                                        className="text-slate-400"
                                                                        aria-label="Erantzunik gabe"
                                                                    >
                                                                        —
                                                                    </span>
                                                                ) : (
                                                                    <>
                                                                        <span
                                                                            className="graph-skill-track"
                                                                            aria-hidden="true"
                                                                        >
                                                                            <span
                                                                                style={{
                                                                                    width: `${skill.score * 10}%`,
                                                                                }}
                                                                            />
                                                                        </span>
                                                                        <span className="graph-skill-score">
                                                                            {
                                                                                skill.score
                                                                            }
                                                                            <span className="text-slate-400">
                                                                                {' '}
                                                                                /
                                                                                10
                                                                            </span>
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </dd>
                                                        </div>
                                                    ))}
                                            </dl>
                                        </div>
                                    ),
                                )
                            ) : (
                                <p className="mt-3 text-xs leading-relaxed text-slate-400">
                                    Ez dago autoebaluazio-erantzunik oraindik.
                                </p>
                            )}
                        </section>
                        {[
                            {
                                label: 'Hobespenak eta konfort-zona',
                                edges: preferred,
                                incoming: false,
                            },
                            {
                                label: 'Saihestuak',
                                edges: avoided,
                                incoming: false,
                            },
                            {
                                label: 'Sarrerako hobespenak',
                                edges: incoming,
                                incoming: true,
                            },
                        ].map((group) => (
                            <details
                                key={group.label}
                                className="graph-report-section"
                                open={group.incoming ? undefined : true}
                            >
                                <summary>{group.label}</summary>
                                <ul>
                                    {group.edges.map((edge) => {
                                        const peer = studentMap.get(
                                            group.incoming
                                                ? edge.source
                                                : edge.target,
                                        );
                                        const detail =
                                            'peerName' in edge
                                                ? edge
                                                : undefined;
                                        const peerId = group.incoming
                                            ? edge.source
                                            : edge.target;
                                        return (
                                            <li
                                                key={`${edge.source}-${edge.target}-${edge.kind}`}
                                            >
                                                {peer ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedId(
                                                                peer.id,
                                                            )
                                                        }
                                                    >
                                                        <span>{peer.name}</span>
                                                        <span
                                                            className="text-xs"
                                                            style={{
                                                                color: kinds[
                                                                    edge.kind
                                                                ].color,
                                                            }}
                                                        >
                                                            {
                                                                kinds[edge.kind]
                                                                    .label
                                                            }
                                                        </span>
                                                    </button>
                                                ) : (
                                                    detail && (
                                                        <p className="py-2 text-xs">
                                                            {detail.accessible ? (
                                                                <a
                                                                    href={`/admin/students/${peerId}`}
                                                                    className="text-teal-700"
                                                                >
                                                                    {
                                                                        detail.peerName
                                                                    }
                                                                </a>
                                                            ) : (
                                                                detail.peerName
                                                            )}{' '}
                                                            ·{' '}
                                                            {
                                                                kinds[edge.kind]
                                                                    .label
                                                            }
                                                        </p>
                                                    )
                                                )}
                                                {detail && (
                                                    <p className="pb-2 text-[11px] leading-relaxed text-slate-400">
                                                        {edge.kind ===
                                                        'restriction'
                                                            ? 'Irakaslearen bereizketa'
                                                            : group.incoming
                                                              ? 'Kideak ikasle hau aukeratu du'
                                                              : 'Ikasleak kidea aukeratu du'}{' '}
                                                        ·{' '}
                                                        {detail.submittedAt
                                                            ? new Date(
                                                                  detail.submittedAt,
                                                              ).toLocaleDateString(
                                                                  'eu-ES',
                                                              )
                                                            : 'Data ezezaguna'}{' '}
                                                        · {detail.sourceLabel}
                                                    </p>
                                                )}
                                            </li>
                                        );
                                    })}
                                    {group.edges.length === 0 && (
                                        <li className="py-2 text-xs text-slate-400">
                                            Ez dago jasotako hobespenik.
                                        </li>
                                    )}
                                </ul>
                            </details>
                        ))}
                        {selected.profile && (
                            <section className="graph-report-section">
                                <h3>Berretsitako esleipenak</h3>
                                <ul>
                                    {selected.profile.assignments.map((row) => (
                                        <li
                                            key={`${row.projectName}-${row.date}`}
                                            className="py-2 text-xs"
                                        >
                                            {row.projectName} ·{' '}
                                            {new Date(
                                                row.date,
                                            ).toLocaleDateString('eu-ES')}{' '}
                                            · {row.revision}. berrikuspena
                                        </li>
                                    ))}
                                </ul>
                                {selected.profile.needsReview && (
                                    <p className="mt-3 text-xs text-amber-700">
                                        Hobespenak berrikusteko eskatu.
                                    </p>
                                )}
                                <a
                                    href={selected.profile.href}
                                    className="mt-3 inline-flex min-h-11 items-center text-sm text-teal-700"
                                >
                                    Jarraipen osoa eta eguneratzea →
                                </a>
                            </section>
                        )}
                    </div>
                </aside>
            )}
        </div>
    );
}
