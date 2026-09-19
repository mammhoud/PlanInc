import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { ScrollArea } from '@/components/Common/ScrollArea';

type GraphNode = {
  id: string;
  label: string;
  kind: 'root' | 'note' | 'ticket' | 'study' | 'agent';
  color: string;
  entityId?: number;
  description?: string;
};

export default function GraphPage() {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const [tickets, setTickets] = useState<any[]>([]);
  const [study, setStudy] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [links, setLinks] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [visibleKinds, setVisibleKinds] = useState<Set<GraphNode['kind']>>(new Set(['note', 'ticket', 'study', 'agent']));
  useEffect(() => {
    void Promise.all([api.tickets.list.query(), api.study.list.query(), api.planningLinks.list.query(undefined, { context: { skipBatch: true } })])
      .then(([nextTickets, nextStudy, nextLinks]) => { setTickets(nextTickets); setStudy(nextStudy); setLinks(nextLinks); })
      .catch((cause) => { console.error('Failed to load graph data', cause); setError(t('operation-failed')); })
      .finally(() => setIsLoading(false));
  }, [t]);
  planinc.use();
  const nodes = useMemo<GraphNode[]>(() => [
    { id: 'root', label: t('graph'), kind: 'root', color: 'bg-primary' },
    ...(planinc.noteList.value ?? []).slice(0, 8).map((item: any) => ({ id: `note-${item.id}`, entityId: item.id, label: item.content?.replace(/<[^>]+>/g, '').slice(0, 28) || t('note'), description: item.content, kind: 'note' as const, color: 'bg-primary' })),
    ...tickets.slice(0, 6).map((item) => ({ id: `ticket-${item.id}`, entityId: item.id, label: item.title, description: item.description, kind: 'ticket' as const, color: 'bg-warning' })),
    ...study.slice(0, 6).map((item) => ({ id: `study-${item.id}`, entityId: item.id, label: item.title, description: item.description, kind: 'study' as const, color: 'bg-success' })),
    { id: 'agents', label: t('agents'), kind: 'agent', color: 'bg-secondary' },
  ], [planinc.noteList.value, tickets, study, t]);
  const visibleNodes = nodes.filter((node) => node.kind === 'root' || visibleKinds.has(node.kind));
  const toggleKind = (kind: GraphNode['kind']) => setVisibleKinds((current) => {
    const next = new Set(current);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    return next;
  });

  return <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-20 md:px-6">
    <div><h1 className="text-xl font-bold">{t('graph')}</h1><p className="text-sm text-foreground-500">{t('graph-description')}</p></div>
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('graph-filters')}>
      {(['note', 'ticket', 'study', 'agent'] as const).map((kind) => <Button key={kind} size="sm" variant={visibleKinds.has(kind) ? 'solid' : 'flat'} onPress={() => toggleKind(kind)}>{t(kind === 'note' ? 'notes' : kind === 'ticket' ? 'tickets' : kind === 'study' ? 'study' : 'agents')}</Button>)}
    </div>
    {error && <p className="rounded-xl bg-danger-50 p-3 text-danger">{error}</p>}
    {isLoading && <p className="py-8 text-center text-foreground-500">{t('in-progress')}</p>}
    <Card><CardBody><div className="overflow-x-auto rounded-2xl bg-content2 p-2"><svg viewBox="0 0 800 420" className="min-w-[640px] w-full" role="img" aria-label={t('graph-description')}>
      {visibleNodes.slice(1).map((node, index) => {
        const from = { x: 400, y: 210 };
        const to = { x: 120 + (index % 4) * 185, y: 90 + Math.floor(index / 4) * 210 };
        return <line key={`edge-${node.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />;
      })}
      {visibleNodes.map((node, index) => {
        const point = node.kind === 'root' ? { x: 400, y: 210 } : { x: 120 + ((index - 1) % 4) * 185, y: 90 + Math.floor((index - 1) / 4) * 210 };
        const kindLabel = node.kind === 'root' ? t('graph') : node.kind === 'ticket' ? t('tickets') : node.kind === 'study' ? t('study') : node.kind === 'agent' ? t('agents') : t('notes');
        return <g key={node.id} role={node.kind === 'root' ? undefined : 'button'} tabIndex={node.kind === 'root' ? undefined : 0} aria-label={`${kindLabel}: ${node.label}`} onClick={() => node.kind !== 'root' && setSelectedNode(node)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && node.kind !== 'root') { event.preventDefault(); setSelectedNode(node); } }} className={node.kind === 'root' ? '' : 'cursor-pointer'}><circle cx={point.x} cy={point.y} r={index === 0 ? 34 : 28} className="fill-background stroke-primary" strokeWidth="3" /><text x={point.x} y={point.y - 4} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">{kindLabel}</text><text x={point.x} y={point.y + 12} textAnchor="middle" className="fill-foreground-500 text-[9px]">{node.label.slice(0, 18)}</text></g>;
      })}
    </svg></div></CardBody></Card>
    {!visibleNodes.length && <p className="py-10 text-center text-foreground-500">{t('no-graph-data')}</p>}
    <Modal isOpen={selectedNode != null} onClose={() => setSelectedNode(null)}>
      <ModalContent>
        <ModalHeader>{selectedNode?.label}</ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-sm text-foreground-500">{selectedNode ? t(selectedNode.kind === 'ticket' ? 'tickets' : selectedNode.kind === 'study' ? 'study' : selectedNode.kind === 'agent' ? 'agents' : 'notes') : ''}</p>
          <p className="whitespace-pre-wrap text-sm">{selectedNode?.description?.replace(/<[^>]+>/g, '') || t('no-description')}</p>
          {selectedNode?.entityId != null && <div className="flex flex-wrap gap-2">{links.filter((link) => (link.sourceType === selectedNode.kind && link.sourceId === selectedNode.entityId) || (link.targetType === selectedNode.kind && link.targetId === selectedNode.entityId)).map((link) => <span key={link.id} className="rounded-full bg-content2 px-2 py-1 text-xs">{link.sourceType}:{link.sourceId} - {link.targetType}:{link.targetId}</span>)}</div>}
        </ModalBody>
        <ModalFooter>
          {selectedNode && selectedNode.kind !== 'agent' && <Button color="primary" onPress={() => { window.location.href = selectedNode.kind === 'ticket' ? '/tickets' : selectedNode.kind === 'study' ? '/study' : '/?path=notes'; }}>{t('open')}</Button>}
          <Button variant="flat" onPress={() => setSelectedNode(null)}>{t('close')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  </ScrollArea>;
}
