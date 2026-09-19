import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
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
};

export default function GraphPage() {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const [tickets, setTickets] = useState<any[]>([]);
  const [study, setStudy] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([api.tickets.list.query(), api.study.list.query()])
      .then(([nextTickets, nextStudy]) => { setTickets(nextTickets); setStudy(nextStudy); })
      .catch((cause) => { console.error('Failed to load graph data', cause); setError(t('operation-failed')); })
      .finally(() => setIsLoading(false));
  }, [t]);
  planinc.use();
  const nodes = useMemo<GraphNode[]>(() => [
    { id: 'root', label: t('graph'), kind: 'root', color: 'bg-primary' },
    ...(planinc.noteList.value ?? []).slice(0, 8).map((item: any) => ({ id: `note-${item.id}`, label: item.content?.replace(/<[^>]+>/g, '').slice(0, 28) || t('note'), kind: 'note' as const, color: 'bg-primary' })),
    ...tickets.slice(0, 6).map((item) => ({ id: `ticket-${item.id}`, label: item.title, kind: 'ticket' as const, color: 'bg-warning' })),
    ...study.slice(0, 6).map((item) => ({ id: `study-${item.id}`, label: item.title, kind: 'study' as const, color: 'bg-success' })),
    { id: 'agents', label: t('agents'), kind: 'agent', color: 'bg-secondary' },
  ], [planinc.noteList.value, tickets, study, t]);

  return <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-20 md:px-6">
    <div><h1 className="text-xl font-bold">{t('graph')}</h1><p className="text-sm text-foreground-500">{t('graph-description')}</p></div>
    {error && <p className="rounded-xl bg-danger-50 p-3 text-danger">{error}</p>}
    {isLoading && <p className="py-8 text-center text-foreground-500">{t('in-progress')}</p>}
    <Card><CardBody><div className="overflow-x-auto rounded-2xl bg-content2 p-2"><svg viewBox="0 0 800 420" className="min-w-[640px] w-full" role="img" aria-label={t('graph-description')}>
      {nodes.slice(1).map((node, index) => {
        const from = { x: 400, y: 210 };
        const to = { x: 120 + (index % 4) * 185, y: 90 + Math.floor(index / 4) * 210 };
        return <line key={`edge-${node.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />;
      })}
      {nodes.map((node, index) => {
        const point = node.kind === 'root' ? { x: 400, y: 210 } : { x: 120 + ((index - 1) % 4) * 185, y: 90 + Math.floor((index - 1) / 4) * 210 };
        const href = node.kind === 'ticket' ? '/tickets' : node.kind === 'study' ? '/study' : node.kind === 'agent' ? '/ai' : '/?path=notes';
        const kindLabel = node.kind === 'root' ? t('graph') : node.kind === 'ticket' ? t('tickets') : node.kind === 'study' ? t('study') : node.kind === 'agent' ? t('agents') : t('notes');
        return <a href={href} key={node.id} aria-label={`${kindLabel}: ${node.label}`}><g><circle cx={point.x} cy={point.y} r={index === 0 ? 34 : 28} className="fill-background stroke-primary" strokeWidth="3" /><text x={point.x} y={point.y - 4} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">{kindLabel}</text><text x={point.x} y={point.y + 12} textAnchor="middle" className="fill-foreground-500 text-[9px]">{node.label.slice(0, 18)}</text></g></a>;
      })}
    </svg></div></CardBody></Card>
    {!nodes.length && <p className="py-10 text-center text-foreground-500">{t('no-graph-data')}</p>}
  </ScrollArea>;
}
