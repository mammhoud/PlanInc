/**
 * tokens-ignore-file: d3 graph node/edge colours are brand chart data
 * (restored from the knowledge-graph feature), not theme design decisions.
 */
import { useEffect, useRef, useState } from 'react';
import { drag } from 'd3-drag';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { forceCluster } from 'd3-force-cluster';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import type { GraphKind, GraphNode } from '@/pages/graph';

type GraphEdge = { id: number; source: GraphNode; target: GraphNode; label: string };

type SimNode = GraphNode & { x: number; y: number; fx?: number | null; fy?: number | null };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: GraphNode | null;
  hoveredNode: GraphNode | null;
  labels: Record<GraphKind, string>;
  relationCount: Map<string, number>;
  onSelect: (node: GraphNode) => void;
  onHover: (node: GraphNode | null) => void;
  ariaLabel: string;
  cameraLabels: {
    fit: string;
    reset: string;
  };
  storageKey?: string;
};

const COLORS: Record<GraphKind, string> = {
  root: '#0284C7',
  note: '#0EA5E9',
  ticket: '#0369A1',
  study: '#06B6D4',
  resource: '#38BDF8',
  agent: '#075985',
};

export function PlanincGraph({ nodes, edges, selectedNode, hoveredNode, labels, relationCount, onSelect, onHover, ariaLabel, cameraLabels, storageKey = 'planinc:graph:camera' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>>>();
  const selectedRef = useRef(selectedNode);
  const hoveredRef = useRef(hoveredNode);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cameraVersion, setCameraVersion] = useState(0);
  selectedRef.current = selectedNode;
  hoveredRef.current = hoveredNode;
  onSelectRef.current = onSelect;
  onHoverRef.current = onHover;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const root = select(svg);
    root.selectAll('*').remove();
    const viewport = root.append('g');
    const edgeLayer = viewport.append('g').attr('stroke', '#7DD3FC').attr('stroke-opacity', 0.4);
    const nodeLayer = viewport.append('g');
    const nodeData: SimNode[] = nodes.map((node, index) => ({
      ...node,
      x: node.kind === 'root' ? 400 : 160 + (index % 6) * 120,
      y: node.kind === 'root' ? 250 : 100 + Math.floor(index / 6) * 85,
    }));
    const nodeById = new Map(nodeData.map((node) => [node.id, node]));
    const edgeData = edges
      .map((edge) => ({ ...edge, source: nodeById.get(edge.source.id), target: nodeById.get(edge.target.id) }))
      .filter((edge): edge is GraphEdge & { source: SimNode; target: SimNode } => Boolean(edge.source && edge.target));
    const clusterCenters = new Map<GraphKind, { x: number; y: number }>([
      ['root', { x: 400, y: 250 }],
      ['note', { x: 250, y: 150 }],
      ['ticket', { x: 550, y: 150 }],
      ['study', { x: 250, y: 350 }],
      ['resource', { x: 550, y: 350 }],
      ['agent', { x: 400, y: 390 }],
    ]);
    const simulation = forceSimulation(nodeData)
      .force('link', forceLink<SimNode, typeof edgeData[number]>(edgeData).id((node) => node.id).distance(120).strength(0.7))
      .force('charge', forceManyBody<SimNode>().strength(-260))
      .force('collide', forceCollide<SimNode>().radius((node) => node.kind === 'root' ? 44 : 34).strength(0.9))
      .force('cluster', forceCluster<SimNode>().centers((node) => clusterCenters.get(node.kind) ?? clusterCenters.get('root')!).strength(0.18))
      .force('center', forceCenter(400, 250))
      .alphaDecay(reducedMotion ? 0.12 : 0.0228);
    simulationRef.current = simulation;
    const edgeSelection = edgeLayer.selectAll<SVGLineElement, typeof edgeData[number]>('line').data(edgeData).join('line')
      .attr('class', 'graph-edge')
      .attr('stroke-width', (edge) => edge.source.kind === 'root' || edge.target.kind === 'root' ? 2 : 1.5);
    const edgeLabelSelection = edgeLayer.selectAll<SVGTextElement, typeof edgeData[number]>('text').data(edgeData).join('text')
      .attr('class', 'graph-edge-label')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .text((edge) => edge.label.slice(0, 24));
    edgeLabelSelection.append('title').text((edge) => edge.label);
    const nodeSelection = nodeLayer.selectAll<SVGGElement, SimNode>('g').data(nodeData, (node) => node.id).join('g')
      .attr('tabindex', (node) => node.kind === 'root' ? null : 0)
      .attr('role', (node) => node.kind === 'root' ? null : 'button')
      .style('cursor', (node) => node.kind === 'root' ? 'default' : 'pointer')
      .on('click', (_, node) => { if (node.kind !== 'root') onSelectRef.current(node); })
      .on('mouseenter', (_, node) => onHoverRef.current(node))
      .on('mouseleave', (_, node) => { if (hoveredRef.current?.id === node.id) onHoverRef.current(null); })
      .on('keydown', (event, node) => {
        if ((event.key === 'Enter' || event.key === ' ') && node.kind !== 'root') {
          event.preventDefault();
          onSelectRef.current(node);
        }
      });
    nodeSelection.append('title').text((node) => `${labels[node.kind]}: ${node.label}`);
    nodeSelection.append('circle').attr('class', 'graph-node-halo').attr('r', 40);
    nodeSelection.append('circle').attr('class', 'graph-node-dot').attr('r', (node) => node.kind === 'root' ? 32 : 26);
    nodeSelection.append('text').attr('class', 'graph-node-label').attr('text-anchor', 'middle').attr('dy', 4)
      .text((node) => node.label.slice(0, 18));
    nodeSelection.call(drag<SVGGElement, SimNode>()
      .on('start', (event, node) => { if (!event.active) simulation.alphaTarget(0.3).restart(); node.fx = node.x; node.fy = node.y; })
      .on('drag', (event, node) => { node.fx = event.x; node.fy = event.y; })
      .on('end', (event, node) => { if (!event.active) simulation.alphaTarget(0); node.fx = null; node.fy = null; }));
    const savedCamera = window.localStorage.getItem(storageKey);
    let initialCamera = zoomIdentity;
    if (savedCamera) {
      try {
        const camera = JSON.parse(savedCamera) as { x: number; y: number; k: number };
        if ([camera.x, camera.y, camera.k].every(Number.isFinite)) initialCamera = zoomIdentity.translate(camera.x, camera.y).scale(camera.k);
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    const zoomBehavior = zoom<SVGSVGElement, unknown>().scaleExtent([0.45, 3]).on('zoom', (event) => {
      viewport.attr('transform', event.transform);
      window.localStorage.setItem(storageKey, JSON.stringify({ x: event.transform.x, y: event.transform.y, k: event.transform.k }));
    });
    root.call(zoomBehavior).call(zoomBehavior.transform, initialCamera);
    simulation.on('tick', () => {
      edgeSelection.attr('x1', (edge) => edge.source.x).attr('y1', (edge) => edge.source.y).attr('x2', (edge) => edge.target.x).attr('y2', (edge) => edge.target.y);
      edgeLabelSelection
        .attr('x', (edge) => (edge.source.x + edge.target.x) / 2)
        .attr('y', (edge) => (edge.source.y + edge.target.y) / 2);
      nodeSelection.attr('transform', (node) => `translate(${node.x},${node.y})`);
      const activeNode = selectedRef.current ?? hoveredRef.current;
      edgeSelection
        .attr('stroke-opacity', (edge) => activeNode
          ? edge.source.id === activeNode.id || edge.target.id === activeNode.id ? 0.95 : 0.12
          : 0.4)
        .attr('stroke-width', (edge) => {
          const baseWidth = edge.source.kind === 'root' || edge.target.kind === 'root' ? 2 : 1.5;
          return activeNode && (edge.source.id === activeNode.id || edge.target.id === activeNode.id) ? baseWidth + 1 : baseWidth;
        });
      edgeLabelSelection.attr('opacity', (edge) => activeNode && (edge.source.id === activeNode.id || edge.target.id === activeNode.id) ? 0.95 : 0);
      nodeSelection.select('.graph-node-halo').attr('opacity', (node) => selectedRef.current?.id === node.id ? 0.8 : hoveredRef.current?.id === node.id ? 0.25 : 0);
      nodeSelection.select('.graph-node-dot').attr('fill', (node) => COLORS[node.kind]).attr('stroke', selectedRef.current?.id === node.id ? '#E0F2FE' : '#F0F9FF').attr('stroke-width', selectedRef.current?.id === node.id ? 5 : 3);
      nodeSelection.select('.graph-node-label').attr('fill', '#F0F9FF').attr('font-size', (node) => node.kind === 'root' ? 12 : 10);
    });
    if (reducedMotion) {
      simulation.stop();
      simulation.tick(120);
    }
    return () => {
      simulation.stop();
      simulationRef.current = undefined;
    };
  }, [nodes, edges, labels, storageKey, cameraVersion, reducedMotion]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const activeNode = selectedNode ?? hoveredNode;
    const root = select(svg);
    root.selectAll<SVGLineElement, GraphEdge & { source: SimNode; target: SimNode }>('.graph-edge')
      .attr('stroke-opacity', (edge) => activeNode
        ? edge.source.id === activeNode.id || edge.target.id === activeNode.id ? 0.95 : 0.12
        : 0.4)
      .attr('stroke-width', (edge) => {
        const baseWidth = edge.source.kind === 'root' || edge.target.kind === 'root' ? 2 : 1.5;
        return activeNode && (edge.source.id === activeNode.id || edge.target.id === activeNode.id) ? baseWidth + 1 : baseWidth;
      });
    root.selectAll<SVGTextElement, GraphEdge & { source: SimNode; target: SimNode }>('.graph-edge-label')
      .attr('opacity', (edge) => activeNode && (edge.source.id === activeNode.id || edge.target.id === activeNode.id) ? 0.95 : 0);
    root.selectAll<SVGCircleElement, SimNode>('.graph-node-halo')
      .attr('opacity', (node) => selectedNode?.id === node.id ? 0.8 : hoveredNode?.id === node.id ? 0.25 : 0);
  }, [selectedNode, hoveredNode]);

  const updateCamera = (mode: 'reset' | 'fit') => {
    const svg = svgRef.current;
    if (!svg) return;
    const root = select(svg);
    const viewport = root.select<SVGGElement>('g');
    const behavior = zoom<SVGSVGElement, unknown>().scaleExtent([0.45, 3]);
    const target = mode === 'reset' ? zoomIdentity : zoomIdentity.translate(400, 250).scale(Math.min(1, 640 / Math.max(640, nodes.length * 45)));
    root.call(behavior.transform, target);
    viewport.attr('transform', target.toString());
    if (mode === 'reset') window.localStorage.removeItem(storageKey);
    setCameraVersion((value) => value + 1);
  };

  return <div className="overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top,#e0f2fe,transparent_60%),#f0f9ff] p-2 dark:bg-[radial-gradient(circle_at_top,#0c4a6e,transparent_60%),#082f49]">
    <svg ref={svgRef} viewBox="0 0 800 500" className="min-h-[320px] min-w-0 w-full select-none touch-none md:min-h-[420px]" role="img" aria-label={ariaLabel}>
      <style>{`.graph-node-halo{fill:#38bdf8;filter:blur(4px)}.graph-node-label,.graph-edge-label{pointer-events:none;font-weight:600;fill:#082f49}.graph-edge-label{font-size:9px;paint-order:stroke;stroke:#f0f9ff;stroke-width:3px;stroke-linejoin:round}.dark .graph-node-label,.dark .graph-edge-label{fill:#f0f9ff}.dark .graph-edge-label{stroke:#082f49}.graph-node-dot{vector-effect:non-scaling-stroke}@media (prefers-color-scheme:dark){.graph-node-label,.graph-edge-label{fill:#f0f9ff}.graph-edge-label{stroke:#082f49}}`}</style>
    </svg>
    <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-2 text-tiny text-sky-700 dark:text-sky-200">
      <span>Drag nodes · scroll to zoom · select a node to inspect</span>
      <span className="flex gap-1">
        <button type="button" aria-label={cameraLabels.fit} className="min-h-11 rounded-md px-3 py-2 hover:bg-sky-200/60 dark:hover:bg-sky-800/60" onClick={() => updateCamera('fit')}>{cameraLabels.fit}</button>
        <button type="button" aria-label={cameraLabels.reset} className="min-h-11 rounded-md px-3 py-2 hover:bg-sky-200/60 dark:hover:bg-sky-800/60" onClick={() => updateCamera('reset')}>{cameraLabels.reset}</button>
      </span>
    </div>
    {reducedMotion && <span className="sr-only">Reduced motion enabled</span>}
  </div>;
}
