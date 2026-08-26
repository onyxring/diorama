import type { World } from '../model/world';

// An Exporter turns a World into source text for one target language. Adding a
// language is just implementing this interface and registering it (see index.ts) —
// the editor and model never learn about output formats.
export interface Exporter {
  readonly id: string;         // stable key, e.g. "beguile"
  readonly label: string;      // display name, e.g. "Beguile"
  readonly extension: string;  // file extension incl. dot, e.g. ".bgl"
  export(world: World): string;
}
