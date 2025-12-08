/**
 * Music Event Emitter - Typed event system for musical events
 */

export type MusicEventType =
  | 'noteOn'
  | 'noteOff'
  | 'pitchChange'
  | 'volumeChange'
  | 'effectChange'
  | 'trigger';

export interface NoteOnEvent {
  type: 'noteOn';
  noteId: string;
  frequency: number;
  velocity: number; // 0-1
  timestamp: number;
}

export interface NoteOffEvent {
  type: 'noteOff';
  noteId: string;
  timestamp: number;
}

export interface PitchChangeEvent {
  type: 'pitchChange';
  noteId: string;
  frequency: number;
  timestamp: number;
}

export interface VolumeChangeEvent {
  type: 'volumeChange';
  noteId: string | null; // null for master volume
  volume: number; // 0-1
  timestamp: number;
}

export interface EffectChangeEvent {
  type: 'effectChange';
  effectId: string;
  parameter: string;
  value: number;
  timestamp: number;
}

export interface TriggerEvent {
  type: 'trigger';
  triggerId: string;
  timestamp: number;
}

export type MusicEvent =
  | NoteOnEvent
  | NoteOffEvent
  | PitchChangeEvent
  | VolumeChangeEvent
  | EffectChangeEvent
  | TriggerEvent;

type EventCallback<T extends MusicEvent = MusicEvent> = (event: T) => void;

export class MusicEventEmitter {
  private listeners: Map<MusicEventType, Set<EventCallback>> = new Map();
  private allListeners: Set<EventCallback> = new Set();

  /**
   * Subscribe to a specific event type
   */
  on<T extends MusicEventType>(
    type: T,
    callback: EventCallback<Extract<MusicEvent, { type: T }>>
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback as EventCallback);

    return () => {
      this.listeners.get(type)?.delete(callback as EventCallback);
    };
  }

  /**
   * Subscribe to all events
   */
  onAny(callback: EventCallback): () => void {
    this.allListeners.add(callback);
    return () => {
      this.allListeners.delete(callback);
    };
  }

  /**
   * Emit an event
   */
  emit(event: MusicEvent): void {
    // Notify specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in ${event.type} listener:`, error);
        }
      });
    }

    // Notify all-event listeners
    this.allListeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in music event listener:', error);
      }
    });
  }

  /**
   * Emit a noteOn event
   */
  noteOn(frequency: number, velocity: number = 0.7): string {
    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.emit({
      type: 'noteOn',
      noteId,
      frequency,
      velocity,
      timestamp: performance.now(),
    });
    return noteId;
  }

  /**
   * Emit a noteOff event
   */
  noteOff(noteId: string): void {
    this.emit({
      type: 'noteOff',
      noteId,
      timestamp: performance.now(),
    });
  }

  /**
   * Emit a pitch change event
   */
  pitchChange(noteId: string, frequency: number): void {
    this.emit({
      type: 'pitchChange',
      noteId,
      frequency,
      timestamp: performance.now(),
    });
  }

  /**
   * Emit a volume change event
   */
  volumeChange(volume: number, noteId: string | null = null): void {
    this.emit({
      type: 'volumeChange',
      noteId,
      volume,
      timestamp: performance.now(),
    });
  }

  /**
   * Emit a trigger event
   */
  trigger(triggerId: string): void {
    this.emit({
      type: 'trigger',
      triggerId,
      timestamp: performance.now(),
    });
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }
}

// Global event emitter instance
export const musicEvents = new MusicEventEmitter();
