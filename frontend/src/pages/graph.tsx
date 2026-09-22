import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, CardBody, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { Icon } from '@/components/Common/Iconify/icons';
import { PlanningViewSwitch } from '@/components/PlanincPlanning/PlanningViewSwitch';
import { PlanningPagination } from '@/components/PlanincPlanning/PlanningPagination';
import { PlanningFab } from '@/components/PlanincPlanning/PlanningFab';
import { PlanincGraph } from '@/components/PlanIncGraph/PlanIncGraph';
import { getPlanIncEndpoint } from '@/lib/planincEndpoint';

export type GraphKind = 'root' | 'note' | 'ticket' | 'study' | 'resource' | 'agent';

type GraphCustomField = {
  id: number;
  kind: 'ticket' | 'study';
  key: string;
  label: string;
  fieldType: string;
  showInGraph: boolean;
};

export type GraphNode = {
  id: string;
  label: string;
  kind: GraphKind;
  color: string;
  entityId?: number;
  description?: string;
  status?: string;
  category?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  customFieldKind?: 'ticket' | 'study';
  href?: string;
  previewImage?: string;
};

export type GraphRelation = {
  id: number;
  sourceType: string;
  targetType: string;
  label: string;
  showInGraph: boolean;
  otherType: string;
  otherId: number;
  other?: GraphNode;
  otherLabel: string;
};

const KIND_LABELS: Record<GraphKind, string> = {
  root: 'graph',
  note: 'notes',
  ticket: 'tickets',
  study: 'study',
  resource: 'resources',
  agent: 'agents',
};

// Shortcut cheat-sheet shown in the help overlay (labels are i18n keys).
const GRAPH_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Tab', 'Enter', 'Space'], label: 'shortcut-focus-node' },
  { keys: ['←', '→'], label: 'shortcut-step' },
  { keys: ['Backspace'], label: 'shortcut-back' },
  { keys: ['Esc'], label: 'shortcut-close' },
  { keys: ['?'], label: 'shortcut-help' },
];

const KIND_COLORS: Record<GraphKind, string> = {
  root: 'text-primary',
  note: 'text-primary',
  ticket: 'text-warning',
  study: 'text-success',
  resource: 'text-secondary',
  agent: 'text-foreground-400',
};

const KIND_BG: Record<GraphKind, string> = {
  root: 'bg-primary',
  note: 'bg-primary',
  ticket: 'bg-warning',
  study: 'bg-success',
  resource: 'bg-secondary',
  agent: 'bg-default-400',
};

const KIND_HREF: Record<GraphKind, string> = {
  root: '/graph',
  note: '/?path=notes',
  ticket: '/tickets',
  study: '/study',
  resource: '/resources',
  agent: '/ai',
};

const KIND_PREVIEW: Record<GraphKind, string> = {
  root: '/planinc-logo-square.jpg',
  note: '/planinc-logo-light.jpg',
  ticket: '/planinc-logo-square.jpg',
  study: '/planinc-logo-light.jpg',
  resource: '/planinc-logo-dark.jpg',
  agent: '/planinc-logo-dark.jpg',
};

function imagePreview(value: any): string | undefined {
  const candidate = typeof value === 'string'
    ? value
    : value?.previewType === 'image'
      ? value.preview
      : value?.image;
  if (!candidate || typeof candidate !== 'string') return undefined;
  if (!/^https?:\/\//.test(candidate) && !/\.(avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(candidate)) return undefined;
  return getPlanIncEndpoint(candidate);
}

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 500;
/** How far the camera zooms in when focusing a node (smaller = closer). */
const FOCUS_SCALE = 0.55;
const FULL_VIEW = { x: 0, y: 0, w: VIEW_WIDTH, h: VIEW_HEIGHT };

const stripHtml = (value: unknown) => String(value ?? '').replace(/<[^>]+>/g, '').trim();

function endpointKey(type: string, id: number) {
  return `${type}:${id}`;
}

export default function GraphPage() {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const [tickets, setTickets] = useState<any[]>([]);
  const [study, setStudy] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [links, setLinks] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<GraphCustomField[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [visibleKinds, setVisibleKinds] = useState<Set<GraphKind>>(new Set(['note', 'ticket', 'study', 'resource', 'agent']));
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [view, setView] = useState(FULL_VIEW);
  const [nodeHistory, setNodeHistory] = useState<GraphNode[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const viewRef = useRef(view);
  const rafRef = useRef<number | null>(null);
  // Node id the camera last animated to. Guards against re-running the focus
  // animation when the graph data refreshes while the preview is open.
  const focusedIdRef = useRef<string | null>(null);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    void Promise.all([
      api.tickets.list.query(),
      api.study.list.query(),
      api.planningLinks.list.query(undefined, { context: { skipBatch: true } }),
      api.attachments.list.query({ page: 1, size: 50 }),
      api.planningFields.list.query(),
      api.conversation.list.query({ page: 1, size: 50 }),
    ])
      .then(([nextTickets, nextStudy, nextLinks, nextResources, nextFields, nextAgents]) => {
        setTickets(nextTickets);
        setStudy(nextStudy);
        setLinks(nextLinks);
        setResources((nextResources as any[]).filter((item) => !item.isFolder));
        setCustomFields((nextFields as GraphCustomField[]).filter((field) => field.showInGraph));
        setAgents(nextAgents);
      })
      .catch((cause) => { console.error('Failed to load graph data', cause); setError(t('operation-failed')); })
      .finally(() => setIsLoading(false));
  }, [t]);
  planinc.use();

  const nodes = useMemo<GraphNode[]>(() => [
    { id: 'root', label: t('graph'), kind: 'root', color: KIND_COLORS.root },
    ...(planinc.noteList.value ?? []).slice(0, 24).map((item: any) => ({
      id: `note-${item.id}`,
      entityId: item.id,
      label: stripHtml(item.content).slice(0, 28) || t('note'),
      description: item.content,
      kind: 'note' as const,
      color: KIND_COLORS.note,
      href: KIND_HREF.note,
      previewImage: imagePreview(item.attachments?.find((attachment: any) => attachment.previewType === 'image')),
    })),
    ...tickets.slice(0, 24).map((item) => ({
      id: `ticket-${item.id}`,
      entityId: item.id,
      label: item.title,
      description: item.description,
      status: item.status,
      category: item.category,
      tags: item.tags,
      customFields: item.customFields,
      customFieldKind: 'ticket' as const,
      kind: 'ticket' as const,
      color: KIND_COLORS.ticket,
      href: KIND_HREF.ticket,
      previewImage: imagePreview(item.attachments?.find((attachment: any) => attachment.previewType === 'image')),
    })),
    ...study.slice(0, 24).map((item) => ({
      id: `study-${item.id}`,
      entityId: item.id,
      label: item.title,
      description: item.description,
      status: item.status,
      category: item.category,
      tags: item.tags,
      customFields: item.customFields,
      customFieldKind: 'study' as const,
      kind: 'study' as const,
      color: KIND_COLORS.study,
      href: KIND_HREF.study,
      previewImage: imagePreview(item.attachments?.find((attachment: any) => attachment.previewType === 'image')),
    })),
    ...resources.slice(0, 24).map((item) => ({
      id: `resource-${item.id}`,
      entityId: item.id,
      label: item.name,
      description: item.path,
      kind: 'resource' as const,
      color: KIND_COLORS.resource,
      href: KIND_HREF.resource,
      previewImage: imagePreview(item.previewType === 'image' ? item : item.image),
    })),
    // Agent destinations are AI chat conversations; fall back to a single hub
    // when the account has no conversations yet.
    ...(agents.length
      ? agents.slice(0, 24).map((item) => ({
        id: `agent-${item.id}`,
        entityId: item.id,
        label: item.title || t('agents'),
        description: item.title ?? '',
        kind: 'agent' as const,
        color: KIND_COLORS.agent,
        href: KIND_HREF.agent,
        previewImage: imagePreview(item.account?.image),
      }))
      : [{ id: 'agents', label: t('agents'), kind: 'agent' as const, color: KIND_COLORS.agent, href: KIND_HREF.agent }]),
  ], [planinc.noteList.value, tickets, study, resources, agents, t]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => node.kind === 'root' || visibleKinds.has(node.kind)),
    [nodes, visibleKinds],
  );

  const endpointToNode = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of visibleNodes) {
      if (node.entityId == null) continue;
      const type = node.kind === 'study' ? 'study' : node.kind;
      map.set(endpointKey(type, node.entityId), node);
    }
    return map;
  }, [visibleNodes]);

  // Only relations explicitly flagged for the graph become edges.
  const graphEdges = useMemo(() => {
    return links
      .filter((link) => link.showInGraph !== false)
      .map((link) => {
        const source = endpointToNode.get(endpointKey(link.sourceType, link.sourceId));
        const target = endpointToNode.get(endpointKey(link.targetType, link.targetId));
        return source && target ? { id: link.id, source, target, label: link.label as string } : null;
      })
      .filter((edge): edge is { id: number; source: GraphNode; target: GraphNode; label: string } => edge != null);
  }, [links, endpointToNode]);

  const relationCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of graphEdges) {
      counts.set(edge.source.id, (counts.get(edge.source.id) ?? 0) + 1);
      counts.set(edge.target.id, (counts.get(edge.target.id) ?? 0) + 1);
    }
    return counts;
  }, [graphEdges]);

  const linkedNodeIds = useMemo(() => new Set(graphEdges.flatMap((edge) => [edge.source.id, edge.target.id])), [graphEdges]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    map.set('root', { x: 400, y: 250 });
    const others = visibleNodes.filter((node) => node.kind !== 'root');
    const total = Math.max(1, others.length);
    others.forEach((node, index) => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
      map.set(node.id, { x: 400 + Math.cos(angle) * 310, y: 250 + Math.sin(angle) * 195 });
    });
    return map;
  }, [visibleNodes]);

  const animateView = (target: { x: number; y: number; w: number; h: number }) => {
    if (typeof requestAnimationFrame === 'undefined') {
      setView(target);
      return;
    }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const start = { ...viewRef.current };
    const startTime = performance.now();
    const duration = 450;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const k = ease(t);
      setView({
        x: start.x + (target.x - start.x) * k,
        y: start.y + (target.y - start.y) * k,
        w: start.w + (target.w - start.w) * k,
        h: start.h + (target.h - start.h) * k,
      });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Centre and zoom the canvas on the selected node (including nodes reached by
  // clicking a relation or stepping with the keyboard), then restore the full
  // view when the preview closes. The animation runs once per focused node, so a
  // background data refresh that rebuilds `positions` does not restart it.
  useEffect(() => {
    const id = selectedNode?.id ?? null;
    if (id == null) {
      if (focusedIdRef.current !== null) {
        focusedIdRef.current = null;
        animateView(FULL_VIEW);
      }
      return;
    }
    if (focusedIdRef.current === id) return;
    const point = positions.get(id);
    // Wait until the node has a position (its kind may have just been revealed).
    if (!point) return;
    focusedIdRef.current = id;
    const w = VIEW_WIDTH * FOCUS_SCALE;
    const h = VIEW_HEIGHT * FOCUS_SCALE;
    animateView({
      x: Math.max(0, Math.min(VIEW_WIDTH - w, point.x - w / 2)),
      y: Math.max(0, Math.min(VIEW_HEIGHT - h, point.y - h / 2)),
      w,
      h,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, positions]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const toggleKind = (kind: GraphKind) => setVisibleKinds((current) => {
    const next = new Set(current);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    return next;
  });

  const listNodes = useMemo(() => visibleNodes.filter((node) => node.kind !== 'root'), [visibleNodes]);
  const pagedListNodes = useMemo(() => listNodes.slice((page - 1) * pageSize, page * pageSize), [listNodes, page, pageSize]);
  useEffect(() => { setPage(1); }, [pageSize, viewMode, visibleKinds]);
  const navigate = (href: string) => { window.location.href = href; };

  const fieldDefinitions = (node: GraphNode) => customFields.filter((field) => field.kind === node.customFieldKind);
  const nodeRelations = (node: GraphNode): GraphRelation[] => {
    if (node.kind === 'root') return [];
    return links
      .filter((link) => (link.sourceType === node.kind && link.sourceId === node.entityId) || (link.targetType === node.kind && link.targetId === node.entityId))
      .map((link) => {
        const otherType = link.sourceType === node.kind && link.sourceId === node.entityId ? link.targetType : link.sourceType;
        const otherId = link.sourceType === node.kind && link.sourceId === node.entityId ? link.targetId : link.sourceId;
        const other = endpointToNode.get(endpointKey(otherType, otherId))
          ?? nodes.find((candidate) => candidate.kind === otherType && candidate.entityId === otherId);
        return { ...link, otherType, otherId, other, otherLabel: other?.label ?? `${otherType}:${otherId}` };
      });
  };
  const selectedRelations = useMemo<GraphRelation[]>(() => (selectedNode ? nodeRelations(selectedNode) : []), [selectedNode, links, nodes, endpointToNode]);
  const relatedNodes = useMemo(
    () => selectedRelations.map((relation) => relation.other).filter((node): node is GraphNode => node != null),
    [selectedRelations],
  );

  const focusNode = (node: GraphNode, pushHistory = true) => {
    if (pushHistory && selectedNode && selectedNode.id !== node.id) {
      setNodeHistory((history) => [...history, selectedNode]);
    }
    // Reveal the target's kind so the camera can centre on it.
    setVisibleKinds((current) => (current.has(node.kind) ? current : new Set([...current, node.kind])));
    setSelectedNode(node);
  };

  const goBack = () => {
    if (!nodeHistory.length) return;
    const previous = nodeHistory[nodeHistory.length - 1];
    setNodeHistory((history) => history.slice(0, -1));
    setVisibleKinds((current) => (current.has(previous.kind) ? current : new Set([...current, previous.kind])));
    setSelectedNode(previous);
  };

  const stepRelation = (direction: 1 | -1) => {
    if (!relatedNodes.length) return;
    const currentIndex = selectedNode ? relatedNodes.findIndex((node) => node.id === selectedNode.id) : -1;
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : relatedNodes.length - 1)
      : (currentIndex + direction + relatedNodes.length) % relatedNodes.length;
    const next = relatedNodes[nextIndex];
    if (next) focusNode(next);
  };

  // Arrow keys step through related nodes without closing the preview;
  // Backspace walks back through the nodes visited.
  useEffect(() => {
    if (!selectedNode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      // The help overlay owns keyboard input while it is open.
      if (helpOpen) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepRelation(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepRelation(-1);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        goBack();
      } else if (event.key === 'Escape') {
        // Step back through the visited nodes before closing outright.
        event.preventDefault();
        event.stopPropagation();
        if (nodeHistory.length) goBack();
        else setSelectedNode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, relatedNodes, nodeHistory, helpOpen]);

  useEffect(() => {
    if (!selectedNode) setNodeHistory([]);
  }, [selectedNode]);

  // "?" toggles the shortcut cheat-sheet from anywhere on the page.
  useEffect(() => {
    const handleHelpKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key !== '?') return;
      event.preventDefault();
      setHelpOpen((open) => !open);
    };
    window.addEventListener('keydown', handleHelpKey);
    return () => window.removeEventListener('keydown', handleHelpKey);
  }, []);

  const nodeTooltip = (node: GraphNode) => {
    const details = [t(KIND_LABELS[node.kind]), node.status ? t(node.status) : null, node.category || null].filter(Boolean).join(' · ');
    const relations = relationCount.get(node.id) ?? 0;
    return `${node.label}\n${details}${relations ? `\n${t('relations-count', { total: relations })}` : ''}`;
  };

  return <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-24 md:px-6">
    <div><h1 className="text-xl font-bold">{t('graph')}</h1><p className="text-sm text-foreground-500">{t('graph-description')}</p></div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('graph-filters')}>
        {(['note', 'ticket', 'study', 'resource', 'agent'] as GraphKind[]).map((kind) => <Button key={kind} size="sm" variant={visibleKinds.has(kind) ? 'solid' : 'flat'} onPress={() => toggleKind(kind)}>{t(KIND_LABELS[kind])}</Button>)}
      </div>
      <div className="flex items-center gap-2">
        <PlanningViewSwitch
          value={viewMode}
          onChange={setViewMode}
          modes={['cards', 'list']}
          labels={{ cards: 'graph', list: 'view-list' }}
          ariaLabel={t('graph-view')}
        />
        <Button
          isIconOnly
          size="sm"
          variant="flat"
          aria-label={t('graph-shortcuts')}
          aria-keyshortcuts="?"
          onPress={() => setHelpOpen(true)}
        >
          <Icon icon="mdi:keyboard-outline" width="18" height="18" />
        </Button>
      </div>
    </div>
    {error && <p className="rounded-xl bg-danger-50 p-3 text-danger">{error}</p>}
    {isLoading && <p className="py-8 text-center text-foreground-500">{t('in-progress')}</p>}

    {!isLoading && viewMode === 'cards' && (
      <Card><CardBody><PlanincGraph
        nodes={visibleNodes}
        edges={graphEdges}
        selectedNode={selectedNode}
        hoveredNode={hoveredNode}
        labels={KIND_LABELS}
        relationCount={relationCount}
        onSelect={(node) => { if (node.kind !== 'root') focusNode(node); }}
        onHover={setHoveredNode}
        ariaLabel={t('graph-description')}
        cameraLabels={{ fit: t('fit'), reset: t('reset') }}
      />
        {hoveredNode && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-content2 p-3 text-sm">
            <Chip size="sm" variant="flat">{t(KIND_LABELS[hoveredNode.kind])}</Chip>
            <span className="font-medium">{hoveredNode.label}</span>
            {hoveredNode.status && <Chip size="sm" variant="flat">{t(hoveredNode.status)}</Chip>}
            {hoveredNode.category && <span className="text-foreground-500">{hoveredNode.category}</span>}
            <span className="text-foreground-500">{t('relations-count', { total: relationCount.get(hoveredNode.id) ?? 0 })}</span>
          </div>
        )}
        {graphEdges.length > 0 && (
          <p className="mt-2 text-right text-tiny text-foreground-500">{t('graph-step-hint')}</p>
        )}
      </CardBody></Card>
    )}

    {!isLoading && viewMode === 'list' && (
      <div className="grid gap-3 md:grid-cols-2">
        {pagedListNodes.map((node) => (
          <Card key={node.id} isPressable onPress={() => setSelectedNode(node)}><CardBody className="gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><span className={`inline-block h-3 w-3 rounded-full ${KIND_BG[node.kind]}`} /><h2 className="font-semibold">{node.label}</h2></div>
              <Chip size="sm" variant="flat">{t(KIND_LABELS[node.kind])}</Chip>
            </div>
            <p className="line-clamp-2 text-sm text-foreground-500">{stripHtml(node.description) || t('no-description')}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-500">
              {node.status && <span>{t(node.status)}</span>}
              <span>{t('relations-count', { total: relationCount.get(node.id) ?? 0 })}</span>
            </div>
          </CardBody></Card>
        ))}
      </div>
    )}
    {!isLoading && viewMode === 'list' && !listNodes.length && <p className="py-10 text-center text-foreground-500">{t('no-graph-data')}</p>}
    {!isLoading && viewMode === 'list' && listNodes.length > 0 && (
      <PlanningPagination page={page} pageSize={pageSize} total={listNodes.length} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[8, 16, 32]} />
    )}
    {!isLoading && viewMode === 'cards' && !visibleNodes.filter((node) => node.kind !== 'root').length && <p className="py-10 text-center text-foreground-500">{t('no-graph-data')}</p>}

    <Modal isOpen={selectedNode != null} onClose={() => setSelectedNode(null)} scrollBehavior="inside" isKeyboardDismissDisabled>
      <ModalContent>
        <ModalHeader>{selectedNode?.label}</ModalHeader>
        <ModalBody className="gap-3">
          <div className="relative overflow-hidden rounded-2xl border border-sky-200 bg-sky-950 p-5 text-sky-50">
            <div
              className="absolute inset-0 scale-110 bg-cover bg-center opacity-20 blur-2xl"
              style={{ backgroundImage: `url("${selectedNode?.previewImage ?? (selectedNode ? KIND_PREVIEW[selectedNode.kind] : KIND_PREVIEW.root)}")` }}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/45 via-sky-950/75 to-slate-950/90" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center gap-2">
              <img
                src={selectedNode?.previewImage ?? (selectedNode ? KIND_PREVIEW[selectedNode.kind] : KIND_PREVIEW.root)}
                alt=""
                className="h-16 w-16 rounded-xl object-cover ring-2 ring-sky-200/70"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">{selectedNode ? t(KIND_LABELS[selectedNode.kind]) : ''}</p>
                <h2 className="text-lg font-semibold">{selectedNode?.label}</h2>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="flat">{selectedNode ? t(KIND_LABELS[selectedNode.kind]) : ''}</Chip>
            {selectedNode?.status && <Chip size="sm" variant="flat">{t(selectedNode.status)}</Chip>}
            {selectedNode?.category && <span className="text-sm text-foreground-500">{selectedNode.category}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm">{stripHtml(selectedNode?.description) || t('no-description')}</p>
          {selectedNode && selectedNode.tags?.length ? <div className="flex flex-wrap gap-1">{selectedNode.tags.map((tag: string) => <Chip key={tag} size="sm" variant="flat">#{tag}</Chip>)}</div> : null}
          {selectedNode && fieldDefinitions(selectedNode).length > 0 && (
            <div className="rounded-xl bg-content2 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground-500">{t('custom-fields')}</p>
              <div className="grid gap-1 text-sm">
                {fieldDefinitions(selectedNode).map((field) => (
                  <div key={field.id} className="flex items-center justify-between gap-2">
                    <span className="text-foreground-500">{field.label}</span>
                    <span>{String(selectedNode.customFields?.[field.key] ?? '—')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedNode && (
            <div className="rounded-xl bg-content2 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground-500">{t('related-items')}</p>
              <div className="flex flex-col gap-1 text-sm">
                {selectedRelations.map((relation) => {
                  const otherNode = relation.other;
                  const otherKind = relation.otherType as GraphKind;
                  return (
                    <button
                      key={relation.id}
                      type="button"
                      onClick={() => {
                        if (otherNode) focusNode(otherNode);
                        else navigate(KIND_HREF[otherKind] ?? '/graph');
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-content3"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${KIND_BG[otherKind] ?? 'bg-default-400'}`} />
                        <span className="truncate">{t(KIND_LABELS[otherKind])}: {relation.otherLabel}{relation.label ? ` · ${relation.label}` : ''}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {relation.showInGraph === false && <Chip size="sm" variant="flat">{t('hidden-from-graph')}</Chip>}
                        <Icon icon="mdi:chevron-right" width="16" height="16" className="text-foreground-500" />
                      </span>
                    </button>
                  );
                })}
                {!selectedRelations.length && <span className="text-foreground-500">{t('no-related-items')}</span>}
                {relatedNodes.length > 0 && <p className="mt-1 text-tiny text-foreground-500">{t('graph-step-hint')}</p>}
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {selectedNode && selectedNode.kind !== 'root' && <Button color="primary" onPress={() => navigate(selectedNode.href ?? KIND_HREF[selectedNode.kind])}>{t('open')}</Button>}
          <Button variant="flat" onPress={() => setSelectedNode(null)}>{t('close')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>

    <Modal isOpen={helpOpen} onClose={() => setHelpOpen(false)} scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Icon icon="mdi:keyboard-outline" width="20" height="20" />
          {t('graph-shortcuts')}
        </ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-sm text-foreground-500">{t('graph-shortcuts-description')}</p>
          <div className="grid gap-2">
            {GRAPH_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground-500">{t(shortcut.label)}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {shortcut.keys.map((key) => (
                    <kbd key={key} className="rounded-md border border-divider bg-content2 px-2 py-0.5 text-tiny font-semibold">{key}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onPress={() => setHelpOpen(false)}>{t('close')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
    <PlanningFab label={t('new-ticket')} onPress={() => navigate('/tickets')} />
  </ScrollArea>;
}
