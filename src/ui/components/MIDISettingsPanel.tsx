/**
 * MIDISettingsPanel - Configure MIDI output settings
 *
 * Allows users to:
 * - Enable/disable MIDI output
 * - Select output device
 * - Configure channel assignments
 * - View connection status
 */

import { useState, useEffect, useCallback } from 'react';
import { MIDIManager, MIDIOutput, type MIDIDeviceInfo } from '../../midi';
import { useAppStore, useInternalSoundsMuted } from '../../state/store';
import { getMusicController } from '../../core/MusicController';

interface MIDISettingsPanelProps {
  isExpanded: boolean;
  onToggle: () => void;
}

function MIDISettingsPanel({ isExpanded, onToggle }: MIDISettingsPanelProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [devices, setDevices] = useState<MIDIDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Internal sounds mute state from store
  const internalSoundsMuted = useInternalSoundsMuted();
  const setInternalSoundsMuted = useAppStore((s) => s.setInternalSoundsMuted);

  // Sync internal sounds mute state to MusicController
  useEffect(() => {
    const musicController = getMusicController();
    musicController.setInternalSoundsMuted(internalSoundsMuted);
  }, [internalSoundsMuted]);

  // Check MIDI support and initialize
  useEffect(() => {
    const supported = MIDIManager.isSupported();
    setIsSupported(supported);

    if (supported && !MIDIManager.isAvailable()) {
      setIsInitializing(true);
      MIDIManager.initialize().then((success) => {
        setIsInitialized(success);
        setIsInitializing(false);
        if (success) {
          setDevices(MIDIManager.getOutputDevices());
        }
      });
    } else if (MIDIManager.isAvailable()) {
      setIsInitialized(true);
      setDevices(MIDIManager.getOutputDevices());
    }
  }, []);

  // Listen for device changes
  useEffect(() => {
    if (!isInitialized) return;

    const unsubscribe = MIDIManager.onStateChange((allDevices) => {
      setDevices(allDevices.filter((d) => d.type === 'output'));
    });

    return unsubscribe;
  }, [isInitialized]);

  // Handle device selection
  const handleDeviceChange = useCallback((deviceId: string) => {
    if (deviceId === '') {
      MIDIOutput.setDevice(null);
      setSelectedDeviceId(null);
    } else {
      if (MIDIOutput.setDevice(deviceId)) {
        setSelectedDeviceId(deviceId);
      }
    }
  }, []);

  // Handle enable toggle
  const handleEnableToggle = useCallback(() => {
    if (isEnabled) {
      MIDIOutput.disable();
      setIsEnabled(false);
    } else {
      MIDIOutput.enable();
      setIsEnabled(true);
    }
  }, [isEnabled]);

  // Handle panic button
  const handlePanic = useCallback(() => {
    MIDIOutput.panic();
  }, []);

  // Get status text and color
  const getStatus = () => {
    if (!isSupported) {
      return { text: 'Not Supported', color: 'var(--color-error)' };
    }
    if (isInitializing) {
      return { text: 'Initializing...', color: 'var(--color-warning)' };
    }
    if (!isInitialized) {
      return { text: 'Not Initialized', color: 'var(--color-error)' };
    }
    if (!isEnabled) {
      return { text: 'Disabled', color: 'var(--color-text-secondary)' };
    }
    if (!selectedDeviceId) {
      return { text: 'No Device', color: 'var(--color-warning)' };
    }
    const device = devices.find((d) => d.id === selectedDeviceId);
    if (device?.state === 'disconnected') {
      return { text: 'Disconnected', color: 'var(--color-error)' };
    }
    return { text: 'Connected', color: 'var(--color-success)' };
  };

  const status = getStatus();

  return (
    <div className={`midi-settings-panel ${isExpanded ? 'midi-settings-panel--expanded' : ''}`}>
      <button
        className="midi-settings-toggle"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide MIDI settings' : 'Show MIDI settings'}
      >
        <span className="midi-settings-toggle-icon">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="midi-settings-toggle-label">MIDI Output</span>
        <span
          className="midi-settings-status"
          style={{ color: status.color }}
        >
          {status.text}
        </span>
      </button>

      {isExpanded && (
        <div className="midi-settings-content">
          {!isSupported ? (
            <div className="midi-settings-unsupported">
              <p>Web MIDI is not supported in this browser.</p>
              <p className="midi-settings-hint">
                Try using Chrome, Edge, or Opera for MIDI support.
              </p>
            </div>
          ) : !isInitialized ? (
            <div className="midi-settings-initializing">
              <p>{isInitializing ? 'Requesting MIDI access...' : 'MIDI access not granted'}</p>
            </div>
          ) : (
            <>
              {/* Enable toggle */}
              <div className="midi-settings-row">
                <label className="midi-settings-label">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={handleEnableToggle}
                    className="midi-settings-checkbox"
                  />
                  <span>Enable MIDI Output</span>
                </label>
              </div>

              {/* Device selector */}
              <div className="midi-settings-row">
                <label className="midi-settings-label">Output Device:</label>
                <select
                  className="midi-settings-select"
                  value={selectedDeviceId || ''}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  disabled={!isEnabled}
                >
                  <option value="">-- Select Device --</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                      {device.state === 'disconnected' ? ' (Disconnected)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {devices.length === 0 && (
                <p className="midi-settings-hint">
                  No MIDI devices found. Connect a MIDI interface or virtual MIDI port.
                </p>
              )}

              {/* Mute internal sounds toggle */}
              {isEnabled && selectedDeviceId && (
                <div className="midi-settings-row">
                  <label className="midi-settings-label">
                    <input
                      type="checkbox"
                      checked={internalSoundsMuted}
                      onChange={(e) => setInternalSoundsMuted(e.target.checked)}
                      className="midi-settings-checkbox"
                    />
                    <span>MIDI Only (mute internal sounds)</span>
                  </label>
                </div>
              )}

              {/* Panic button */}
              {isEnabled && selectedDeviceId && (
                <div className="midi-settings-row">
                  <button
                    className="midi-settings-panic-btn"
                    onClick={handlePanic}
                    title="Stop all MIDI notes"
                  >
                    PANIC (All Notes Off)
                  </button>
                </div>
              )}

              {/* Help text */}
              <p className="midi-settings-help">
                Send MIDI to DAWs, synths, and other music software. Works alongside internal sounds.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default MIDISettingsPanel;
