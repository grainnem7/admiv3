/**
 * MIDIManager - Web MIDI API access and device management
 *
 * Handles:
 * - MIDI access permission
 * - Device enumeration
 * - Connection/disconnection events
 * - Output device selection
 */

import type { MIDIDeviceInfo, MIDIMessage } from './types';

type MIDIStateCallback = (devices: MIDIDeviceInfo[]) => void;
type MIDIMessageCallback = (message: MIDIMessage) => void;

class MIDIManagerClass {
  private midiAccess: MIDIAccess | null = null;
  private isInitialized = false;
  private initPromise: Promise<boolean> | null = null;
  private stateCallbacks: Set<MIDIStateCallback> = new Set();
  private messageCallbacks: Set<MIDIMessageCallback> = new Set();
  private selectedOutputId: string | null = null;
  private midiEnabled: boolean = false;

  /**
   * Initialize Web MIDI API access
   * @returns true if MIDI is supported and access was granted
   */
  async initialize(): Promise<boolean> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already initialized
    if (this.isInitialized && this.midiAccess) {
      return true;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    // Check if Web MIDI is supported
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API is not supported in this browser');
      return false;
    }

    try {
      // Request MIDI access (sysex not needed for basic output)
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

      // Listen for device changes
      this.midiAccess.onstatechange = this.handleStateChange.bind(this);

      this.isInitialized = true;
      console.log('MIDI Manager initialized successfully');

      // Notify listeners of initial device state
      this.notifyStateChange();

      return true;
    } catch (error) {
      console.error('Failed to initialize MIDI:', error);
      return false;
    }
  }

  /**
   * Check if MIDI is available and initialized
   */
  isAvailable(): boolean {
    return this.isInitialized && this.midiAccess !== null;
  }

  /**
   * Check if Web MIDI API is supported by the browser
   */
  isSupported(): boolean {
    return 'requestMIDIAccess' in navigator;
  }

  /**
   * Get list of available output devices
   */
  getOutputDevices(): MIDIDeviceInfo[] {
    if (!this.midiAccess) return [];

    const devices: MIDIDeviceInfo[] = [];
    this.midiAccess.outputs.forEach((output) => {
      devices.push({
        id: output.id,
        name: output.name || 'Unknown Device',
        manufacturer: output.manufacturer || 'Unknown',
        state: output.state,
        type: 'output',
      });
    });

    return devices;
  }

  /**
   * Get list of available input devices (for future use)
   */
  getInputDevices(): MIDIDeviceInfo[] {
    if (!this.midiAccess) return [];

    const devices: MIDIDeviceInfo[] = [];
    this.midiAccess.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || 'Unknown',
        state: input.state,
        type: 'input',
      });
    });

    return devices;
  }

  /**
   * Get a specific output port by ID
   */
  getOutput(deviceId: string): MIDIOutput | null {
    if (!this.midiAccess) return null;
    return this.midiAccess.outputs.get(deviceId) || null;
  }

  /**
   * Select an output device by ID
   */
  selectOutput(deviceId: string | null): boolean {
    if (deviceId === null) {
      this.selectedOutputId = null;
      return true;
    }

    const output = this.getOutput(deviceId);
    if (output) {
      this.selectedOutputId = deviceId;
      return true;
    }

    console.warn(`MIDI output device not found: ${deviceId}`);
    return false;
  }

  /**
   * Get the currently selected output device
   */
  getSelectedOutput(): MIDIOutput | null {
    if (!this.selectedOutputId) return null;
    return this.getOutput(this.selectedOutputId);
  }

  /**
   * Get the ID of the currently selected output
   */
  getSelectedOutputId(): string | null {
    return this.selectedOutputId;
  }

  /**
   * Subscribe to device state changes
   */
  onStateChange(callback: MIDIStateCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Handle MIDI state change events
   */
  private handleStateChange(event: MIDIConnectionEvent): void {
    const port = event.port;
    if (!port) {
      this.notifyStateChange();
      return;
    }

    console.log(`MIDI ${port.type} ${port.name}: ${port.state}`);

    // If our selected output disconnected, clear selection
    if (
      port.type === 'output' &&
      port.id === this.selectedOutputId &&
      port.state === 'disconnected'
    ) {
      console.warn('Selected MIDI output disconnected');
      // Don't clear selection - it may reconnect
    }

    this.notifyStateChange();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyStateChange(): void {
    const devices = [...this.getOutputDevices(), ...this.getInputDevices()];
    this.stateCallbacks.forEach((callback) => {
      try {
        callback(devices);
      } catch (error) {
        console.error('Error in MIDI state callback:', error);
      }
    });
  }

  /**
   * Subscribe to outgoing MIDI messages (for monitoring)
   */
  onMessage(callback: MIDIMessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  /**
   * Notify message subscribers (called by MIDIOutput when sending)
   */
  notifyMessage(message: MIDIMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        console.error('Error in MIDI message callback:', error);
      }
    }
  }

  /**
   * Set MIDI enabled state
   */
  setEnabled(enabled: boolean): void {
    this.midiEnabled = enabled;
  }

  /**
   * Check if MIDI is enabled
   */
  isEnabled(): boolean {
    return this.midiEnabled && this.selectedOutputId !== null;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
    }
    this.stateCallbacks.clear();
    this.selectedOutputId = null;
    this.midiAccess = null;
    this.isInitialized = false;
    this.initPromise = null;
  }
}

// Singleton instance
export const MIDIManager = new MIDIManagerClass();

// Also export the class for testing
export { MIDIManagerClass };
