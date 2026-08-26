import type { Exporter } from './exporter';
import { beguileExporter } from './beguile';

// Registry of available exporters. Beguile is the first (and, for now, only) target;
// future languages register here and appear in the UI automatically.
export const exporters: Exporter[] = [
  beguileExporter,
];

export function getExporter(id: string): Exporter | undefined {
  return exporters.find(e => e.id === id);
}

export type { Exporter };
