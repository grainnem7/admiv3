// src/audio/audioConfig.ts
//
// All tunable numbers for the shared studio master chain + space reverb.
// Centralised here per the project rule: every audible threshold must be
// adjustable in one place (facilitator calibration can later read/write these).

/** EQ3 settings (gains in dB). Low-shelf adds body; high band tames harshness. */
export interface EqConfig {
  low: number;
  mid: number;
  high: number;
  lowFrequency: number;
  highFrequency: number;
}

/** Glue compressor. Web Audio DynamicsCompressor has zero lookahead → 0 ms latency. */
export interface CompConfig {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
}

export interface SaturationConfig {
  /** tanh drive; higher = warmer/more coloured. ~1–3 is gentle. */
  drive: number;
}

export interface LimiterConfig {
  /** Output ceiling in dB. ~-0.3 = loud but clip-proof. */
  ceilingDb: number;
}

export interface ReverbConfig {
  decay: number;
  preDelay: number;
  /** Parallel send level (0–1) from the mix into the reverb. */
  sendLevel: number;
}

export interface MasterChainConfig {
  eq: EqConfig;
  comp: CompConfig;
  saturation: SaturationConfig;
  limiter: LimiterConfig;
}

export const DEFAULT_MASTER_CHAIN: MasterChainConfig = {
  eq: { low: 2, mid: 0, high: -1.5, lowFrequency: 250, highFrequency: 3500 },
  comp: { threshold: -18, ratio: 2, attack: 0.02, release: 0.18, knee: 6 },
  saturation: { drive: 1.5 },
  limiter: { ceilingDb: -0.3 },
};

export const DEFAULT_SPACE_REVERB: ReverbConfig = {
  decay: 2.4,
  preDelay: 0.012,
  sendLevel: 0.12,
};

/**
 * The board sequencer's mix. Stereo placement, kick ducking and how long a note may ring
 * into the next one. Separate from the master chain so the board can be A/B'd against
 * its old mix (the player's "Studio mix" switch) without touching Song or Remix.
 */
export interface BoardMixConfig {
  /** Pan per extra channel of the same role, in order (-1 left … 1 right). Bass stays centred. */
  pans: { melody: number[]; chord: number[] };
  /** Kit pieces placed across the stereo field; anything unlisted stays centred. */
  drumPans: Partial<Record<'kick' | 'snare' | 'hat' | 'crash' | 'tom' | 'clap' | 'rim', number>>;
  duck: {
    /** How far bass, chords and pads dip on each kick (0 = none, 0.3 ≈ -3 dB). */
    depth: number;
    /** Time constant of the dip, seconds. Short, so the kick punches through. */
    attackTc: number;
    /** How long the dip holds before recovering, seconds. */
    holdSec: number;
    /** Time constant of the recovery, seconds. The "breathing". */
    releaseTc: number;
  };
  /** The longest a melody or bass note rings towards the next one, in beats. */
  legatoMaxBeats: number;
}

export const DEFAULT_BOARD_MIX: BoardMixConfig = {
  pans: { melody: [0.2, -0.35, 0.45, -0.15], chord: [-0.25, 0.3, -0.4, 0.15] },
  drumPans: { hat: 0.3, crash: -0.25, tom: -0.15, clap: 0.1, rim: 0.2 },
  duck: { depth: 0.3, attackTc: 0.004, holdSec: 0.05, releaseTc: 0.07 },
  legatoMaxBeats: 4,
};
