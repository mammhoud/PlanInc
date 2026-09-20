declare module 'd3-force-cluster' {
  import type { Force, SimulationNodeDatum } from 'd3-force';

  export function forceCluster<Node extends SimulationNodeDatum>(): Force<Node, undefined> & {
    centers(value: (node: Node) => { x: number; y: number }): unknown;
    strength(value: number): unknown;
  };
}
