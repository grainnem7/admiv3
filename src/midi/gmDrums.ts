import type { KitDrum } from '../audio/instruments/RoundRobinDrumKit';

/** General MIDI drum notes for the kit pieces (channel 10 convention). */
export const KIT_GM_NOTE: Record<KitDrum, number> = {
  kick: 36, snare: 38, hat: 42, crash: 49, tom: 45, clap: 39, rim: 37, kickCrash: 36,
};
