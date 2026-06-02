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
