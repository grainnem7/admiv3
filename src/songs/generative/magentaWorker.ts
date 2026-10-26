/// <reference lib="webworker" />
/**
 * Magenta's models, in their own thread. Loading them (TensorFlow.js compiling, a few MB
 * of weights) and running them froze the page for seconds — on the thread that reads the
 * camera and schedules every note — the first time a player turned the fill up. Here they
 * can take as long as they like. Only model work happens here: what to ask for, and what
 * to keep of the answer, stay in magentaFill.ts.
 */
import type { QuantizedSequence } from './magentaSequences';

const CHECKPOINTS = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/';
const VAE_CHECKPOINTS = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/';

interface Rnn {
  initialize(): Promise<void>;
  continueSequence(seq: QuantizedSequence, steps: number, temperature?: number, chordProgression?: string[]): Promise<{ notes?: QuantizedSequence['notes'] | null }>;
}
interface Vae {
  initialize(): Promise<void>;
  similar(seq: QuantizedSequence, n: number, similarity: number, temperature?: number): Promise<{ notes?: QuantizedSequence['notes'] | null }[]>;
}

export type MagentaRequest =
  | { id: number; kind: 'load' }
  | { id: number; kind: 'loadVae' }
  | { id: number; kind: 'continue'; model: 'melody' | 'improv' | 'drums'; seq: QuantizedSequence; steps: number; temperature: number; progression?: string[] }
  | { id: number; kind: 'similar'; seq: QuantizedSequence; n: number; similarity: number; temperature: number };

export type MagentaReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

// Magenta looks things up on `window`, which a worker doesn't have: its own global stands
// in (set before Magenta is imported, below).
(self as unknown as { window: typeof self }).window = self;

const rnns: Partial<Record<'melody' | 'improv' | 'drums', Rnn>> = {};
let vae: Vae | null = null;

async function handle(req: MagentaRequest): Promise<unknown> {
  switch (req.kind) {
    case 'load': {
      const mm = await import('@magenta/music/esm/music_rnn');
      const melody = new mm.MusicRNN(`${CHECKPOINTS}melody_rnn`) as unknown as Rnn;
      const improv = new mm.MusicRNN(`${CHECKPOINTS}chord_pitches_improv`) as unknown as Rnn;
      const drums = new mm.MusicRNN(`${CHECKPOINTS}drum_kit_rnn`) as unknown as Rnn;
      await Promise.all([melody.initialize(), improv.initialize(), drums.initialize()]);
      Object.assign(rnns, { melody, improv, drums });
      return null;
    }
    case 'loadVae': {
      const mv = await import('@magenta/music/esm/music_vae');
      const v = new mv.MusicVAE(`${VAE_CHECKPOINTS}mel_2bar_small`) as unknown as Vae;
      await v.initialize();
      vae = v;
      return null;
    }
    case 'continue': {
      const m = rnns[req.model];
      if (!m) throw new Error(`${req.model} is not loaded`);
      const out = await m.continueSequence(req.seq, req.steps, req.temperature, req.progression);
      return { notes: out.notes ?? null };
    }
    case 'similar': {
      if (!vae) throw new Error('the variation model is not loaded');
      const out = await vae.similar(req.seq, req.n, req.similarity, req.temperature);
      return out.map((o) => ({ notes: o.notes ?? null }));
    }
  }
}

self.onmessage = (e: MessageEvent<MagentaRequest>) => {
  const req = e.data;
  handle(req).then(
    (result) => self.postMessage({ id: req.id, ok: true, result } satisfies MagentaReply),
    (err: unknown) => self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies MagentaReply),
  );
};
