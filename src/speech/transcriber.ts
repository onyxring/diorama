// A Transcriber turns captured 16 kHz mono PCM into text. It's pluggable so the
// engine can be swapped — on-device Whisper (the first impl), a cloud STT, etc. —
// without the editor or capture code changing.

export interface TranscribeProgress {
  (fraction: number, message: string): void;
}

export interface TranscribeOptions {
  /** Ask for an LLM copy-edit (quotes + punctuation) after transcription. Honored by the
   *  local server, which does the LLM hop itself; other engines ignore it. */
  polish?: boolean;
}

export interface Transcriber {
  readonly id: string;
  readonly label: string;
  /** True once the engine is warmed and ready (model downloaded/initialized). */
  readonly isLoaded: boolean;
  /** Warm the engine (download/init the model). Idempotent; safe to call eagerly. */
  load(onProgress?: TranscribeProgress): Promise<void>;
  /** Transcribe 16 kHz mono PCM to text. */
  transcribe(pcm16k: Float32Array, onProgress?: TranscribeProgress, opts?: TranscribeOptions): Promise<string>;
}

import { whisperTranscriber } from './whisper';
import { localServerTranscriber } from './localServer';
import { groqTranscriber, openaiTranscriber } from './cloud';
import { getSettings, type Engine } from '../settings';

const byEngine: Record<Engine, Transcriber> = {
  ondevice: whisperTranscriber,
  local: localServerTranscriber,
  groq: groqTranscriber,
  openai: openaiTranscriber,
};

export const transcribers: Transcriber[] = Object.values(byEngine);

/** The transcriber the UI uses, per the user's Settings engine choice. */
export function activeTranscriber(): Transcriber {
  return byEngine[getSettings().engine] ?? whisperTranscriber;
}
