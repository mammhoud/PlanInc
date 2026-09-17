import { Icon } from '@/components/Common/Iconify/icons';
import { Card, CardBody, Button } from '@heroui/react';
import { useMemo, useState, type CSSProperties } from 'react';

type GraphNote = {
  id: number;
  content?: string | null;
  createdAt?: string | Date;
};

type GraphNode = {
  id: string;
  label: string;
  kind: 'note' | 'tag' | 'object';
  x: number;
  y: number;
  radius: number;
  color: string;
  note?: GraphNote;
};

type GraphEdge = { source: string; target: string };

type KnowledgeGraphProps = { notes: GraphNote[] };

const WIDTH = 960;
const HEIGHT = 520;
const COLORS = {
  note: '#e61919',
  tag: '#4af626',
  object: '#eaeaea',
};

function noteTitle(content: string) {
  const heading = content.match(/^#{1,3}\s+(.+)$/m)?.[1];
  return (heading || content.split(/\n+/)[0] || 'Untitled note').replace(/[*_`]/g, '').trim();
}

function wikiLinks(content: string) {
  return [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildGraph(notes: GraphNote[]) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const tagIds = new Map<string, string>();
  const objectIds = new Map<string, string>();
  const visibleNotes = notes.slice(0, 42);
  const titleIds = new Map(visibleNotes.map((note) => [noteTitle(note.content ?? '').toLowerCase(), `note-${note.id}`]));

  visibleNotes.forEach((note, index) => {
    const angle = (index / Math.max(visibleNotes.length, 1)) * Math.PI * 2;
    const ring = 145 + (index % 3) * 45;
    const noteId = `note-${note.id}`;
    nodes.push({
      id: noteId,
      label: noteTitle(note.content ?? '').length > 30 ? `${noteTitle(note.content ?? '').slice(0, 30)}…` : noteTitle(note.content ?? ''),
      kind: 'note',
      x: WIDTH / 2 + Math.cos(angle) * ring,
      y: HEIGHT / 2 + Math.sin(angle) * ring * 0.64,
      radius: 12,
      color: COLORS.note,
      note,
    });

    const tags = (note.content?.match(/#[\w/-]+/g) ?? []).slice(0, 5).map((tag) => tag.slice(1));
    tags.forEach((tag, tagIndex) => {
      const id = `tag-${tag.toLowerCase()}`;
      if (!tagIds.has(id)) {
        tagIds.set(id, tag);
        nodes.push({
          id,
          label: `#${tag}`,
          kind: 'tag',
          x: 90 + (tagIds.size % 5) * 185,
          y: 78 + (tagIds.size % 3) * 175,
          radius: 8,
          color: COLORS.tag,
        });
      }
      edges.push({ source: noteId, target: id });
      if (tagIndex === 0) {
        const objectName = tag.split('/')[0];
        const objectId = `object-${objectName.toLowerCase()}`;
        if (!objectIds.has(objectId)) {
          objectIds.set(objectId, objectName);
          nodes.push({
            id: objectId,
            label: objectName,
            kind: 'object',
            x: WIDTH / 2 + (objectIds.size - 1) * 150 - 75,
            y: HEIGHT - 54,
            radius: 10,
            color: COLORS.object,
          });
        }
          edges.push({ source: id, target: objectId });
      }
    });

    wikiLinks(note.content ?? '').forEach((target, linkIndex) => {
      const id = `link-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      if (!objectIds.has(id)) {
        objectIds.set(id, target);
        nodes.push({
          id,
          label: target.length > 26 ? `${target.slice(0, 26)}…` : target,
          kind: 'object',
          x: 110 + ((objectIds.size + linkIndex) % 6) * 148,
          y: 430 - ((objectIds.size + linkIndex) % 2) * 70,
          radius: 10,
          color: COLORS.object,
        });
      }
      edges.push({ source: noteId, target: id });
      const linkedNoteId = titleIds.get(target.toLowerCase());
      if (linkedNoteId && linkedNoteId !== noteId) edges.push({ source: id, target: linkedNoteId });
    });
  });

  if (nodes.length === 0) {
    nodes.push({ id: 'empty', label: 'No notes yet', kind: 'object', x: WIDTH / 2, y: HEIGHT / 2, radius: 11, color: COLORS.object });
  }
  return { nodes, edges };
}

export function KnowledgeGraph({ notes }: KnowledgeGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const graph = useMemo(() => buildGraph(notes), [notes]);
  const selected = graph.nodes.find((node) => node.id === selectedId);

  const adjustZoom = (delta: number) => setZoom((value) => Math.min(1.65, Math.max(.7, Number((value + delta).toFixed(2)))));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); setSelectedId(null); };
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <Card className="blinko-crm-graph" shadow="none">
      <CardBody className="gap-4 p-4 md:p-6">
        <div className="blinko-crm-graph__head">
          <div>
            <span className="blinko-crm-graph__kicker">Knowledge graph / linked objects</span>
            <h2>Notes as a connected system</h2>
            <p>Select a node to inspect it. Drag the canvas to move the graph and use the controls to change scale.</p>
          </div>
          <div className="blinko-crm-graph__legend" aria-label="Graph legend">
            <span><i data-kind="note" /> Notes</span><span><i data-kind="tag" /> Tags</span><span><i data-kind="object" /> Objects</span>
          </div>
        </div>
        <div
          className="blinko-crm-graph__canvas"
          onWheel={(event) => { event.preventDefault(); adjustZoom(event.deltaY > 0 ? -.08 : .08); }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragStart({ x: event.clientX - pan.x, y: event.clientY - pan.y }); }}
          onPointerMove={(event) => { if (dragStart) setPan({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y }); }}
          onPointerUp={() => setDragStart(null)}
          onPointerCancel={() => setDragStart(null)}
        >
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Connected notes and tags graph">
            <g transform={`translate(${pan.x} ${pan.y}) translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${zoom}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}>
              {graph.edges.map((edge, index) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;
                return <line key={`${edge.source}-${edge.target}-${index}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="blinko-crm-graph__edge" />;
              })}
              {graph.nodes.map((node, index) => {
                const active = selectedId === node.id;
                return (
                  <g key={node.id} className={`blinko-crm-graph__node blinko-crm-graph__node--${node.kind} ${active ? 'is-selected' : ''}`} onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); } }} tabIndex={0} role="button" aria-label={`${node.kind}: ${node.label}`} style={{ '--node-delay': `${index * 18}ms` } as CSSProperties}>
                    {node.kind === 'object' ? <rect x={node.x - node.radius} y={node.y - node.radius} width={node.radius * 2} height={node.radius * 2} fill={node.color} /> : <circle cx={node.x} cy={node.y} r={node.radius} fill={node.color} />}
                    <circle cx={node.x} cy={node.y} r={node.radius + 5} className="blinko-crm-graph__halo" />
                    <text x={node.x + node.radius + 8} y={node.y + 4}>{node.label}</text>
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="blinko-crm-graph__controls" aria-label="Graph controls">
            <Button isIconOnly size="sm" variant="flat" aria-label="Zoom out" onPress={() => adjustZoom(-.1)}><Icon icon="mdi:minus" /></Button>
            <span>{Math.round(zoom * 100)}%</span>
            <Button isIconOnly size="sm" variant="flat" aria-label="Zoom in" onPress={() => adjustZoom(.1)}><Icon icon="mdi:plus" /></Button>
            <Button size="sm" variant="light" onPress={resetView}>Reset</Button>
          </div>
        </div>
        {selected && <aside className="blinko-crm-graph__selection" aria-live="polite"><span>{selected.kind}</span><strong>{selected.label}</strong>{selected.note?.content && <p>{selected.note.content.replace(/\n+/g, ' ').slice(0, 220)}</p>}</aside>}
        <div className="blinko-crm-graph__footer"><span>{graph.nodes.length} nodes</span><span>{graph.edges.length} relationships</span><span>Drag canvas to explore</span></div>
      </CardBody>
    </Card>
  );
}
