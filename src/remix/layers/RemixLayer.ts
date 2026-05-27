/**
 * RemixLayer — a sound source layered alongside the 4 stems on the Remix
 * screen (percussion, instrument, loop, pad). Each layer mixes into the
 * engine's layersBus with its own enable + volume. Trigger-type layers
 * (percussion) add their own trigger method; continuous layers add theirs.
 * The base interface is lifecycle + mix only.
 */
export type RemixLayerKind = 'percussion' | 'instrument' | 'loop' | 'pad';

export interface RemixLayer {
  readonly id: string;
  readonly kind: RemixLayerKind;
  /** Wire this layer's output into the engine's layers bus. */
  connect(dest: AudioNode): void;
  /** Bring the layer into / out of the mix. */
  setEnabled(on: boolean): void;
  /** Whether the layer is currently enabled. */
  isEnabled(): boolean;
  /** The layer's own level, 0–1. */
  setVolume(v: number): void;
  /** True once the layer's samples are loaded and it can play. */
  isReady(): boolean;
  dispose(): void;
}

/**
 * A RemixLayer that runs a continuous source synced to the transport
 * (vs. a trigger layer like percussion). The engine aligns these at
 * transport time 0 on a fresh play, and stops them on stop.
 */
export interface SyncedRemixLayer extends RemixLayer {
  syncStart(): void;
  syncStop(): void;
}

/** True when a layer participates in transport sync. */
export function isSyncedLayer(l: RemixLayer): l is SyncedRemixLayer {
  return (
    typeof (l as Partial<SyncedRemixLayer>).syncStart === 'function' &&
    typeof (l as Partial<SyncedRemixLayer>).syncStop === 'function'
  );
}
