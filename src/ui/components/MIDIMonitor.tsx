/**
 * MIDIMonitor - Display outgoing MIDI messages
 *
 * Shows a log of recent MIDI events (notes, CCs) being sent
 */

import React, { useState, useEffect, useRef } from 'react';
import { getMIDIManager, type MIDIMessage } from '../../midi';

interface MIDILogEntry {
  timestamp: number;
  type: 'noteOn' | 'noteOff' | 'cc' | 'pitchBend';
  channel: number;
  data1: number;
  data2?: number;
  displayText: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiNoteToName(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = NOTE_NAMES[midiNote % 12];
  return `${noteName}${octave}`;
}

function formatMIDIMessage(msg: MIDIMessage): MIDILogEntry {
  const status = msg.data[0];
  const channel = (status & 0x0f) + 1;
  const type = status & 0xf0;
  const data1 = msg.data[1];
  const data2 = msg.data.length > 2 ? msg.data[2] : undefined;

  let msgType: MIDILogEntry['type'] = 'noteOn';
  let displayText = '';

  switch (type) {
    case 0x90: // Note On
      if (data2 === 0) {
        msgType = 'noteOff';
        displayText = `Note Off: ${midiNoteToName(data1)}`;
      } else {
        msgType = 'noteOn';
        displayText = `Note On: ${midiNoteToName(data1)} vel=${data2}`;
      }
      break;
    case 0x80: // Note Off
      msgType = 'noteOff';
      displayText = `Note Off: ${midiNoteToName(data1)}`;
      break;
    case 0xb0: // Control Change
      msgType = 'cc';
      displayText = `CC ${data1}: ${data2}`;
      break;
    case 0xe0: // Pitch Bend
      msgType = 'pitchBend';
      const bendValue = ((data2 ?? 0) << 7) | data1;
      displayText = `Pitch Bend: ${bendValue - 8192}`;
      break;
    default:
      displayText = `Unknown: ${status.toString(16)}`;
  }

  return {
    timestamp: msg.timestamp,
    type: msgType,
    channel,
    data1,
    data2,
    displayText,
  };
}

interface MIDIMonitorProps {
  maxEntries?: number;
  compact?: boolean;
}

export const MIDIMonitor: React.FC<MIDIMonitorProps> = ({
  maxEntries = 20,
  compact = false,
}) => {
  const [entries, setEntries] = useState<MIDILogEntry[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const midiManager = getMIDIManager();

    // Check initial state
    setIsEnabled(midiManager.isEnabled());
    const output = midiManager.getSelectedOutput();
    setDeviceName(output?.name ?? null);

    // Subscribe to MIDI messages
    const unsubscribe = midiManager.onMessage((msg: MIDIMessage) => {
      const entry = formatMIDIMessage(msg);
      setEntries((prev) => {
        const newEntries = [entry, ...prev];
        return newEntries.slice(0, maxEntries);
      });
    });

    // Poll for state changes
    const interval = setInterval(() => {
      setIsEnabled(midiManager.isEnabled());
      const output = midiManager.getSelectedOutput();
      setDeviceName(output?.name ?? null);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [maxEntries]);

  // Auto-scroll to newest
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [entries]);

  const clearLog = () => setEntries([]);

  const getTypeColor = (type: MIDILogEntry['type']): string => {
    switch (type) {
      case 'noteOn':
        return '#4caf50';
      case 'noteOff':
        return '#ff9800';
      case 'cc':
        return '#2196f3';
      case 'pitchBend':
        return '#9c27b0';
      default:
        return '#888';
    }
  };

  return (
    <div className={`midi-monitor ${compact ? 'compact' : ''}`}>
      <div className="midi-monitor-header">
        <div className="midi-status">
          <span className={`status-dot ${isEnabled ? 'active' : ''}`} />
          <span className="status-text">
            {isEnabled ? deviceName ?? 'MIDI Enabled' : 'MIDI Disabled'}
          </span>
        </div>
        <button className="clear-btn" onClick={clearLog}>
          Clear
        </button>
      </div>

      <div className="midi-log" ref={logRef}>
        {entries.length === 0 ? (
          <div className="empty-log">
            {isEnabled
              ? 'Waiting for MIDI events...'
              : 'Enable MIDI to see messages'}
          </div>
        ) : (
          entries.map((entry, i) => (
            <div
              key={`${entry.timestamp}-${i}`}
              className="midi-entry"
              style={{ borderLeftColor: getTypeColor(entry.type) }}
            >
              <span className="entry-channel">Ch{entry.channel}</span>
              <span className="entry-text">{entry.displayText}</span>
            </div>
          ))
        )}
      </div>

      <style>{`
        .midi-monitor {
          background: #1a1a2e;
          border-radius: 8px;
          overflow: hidden;
        }

        .midi-monitor.compact {
          font-size: 11px;
        }

        .midi-monitor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #0d0d1a;
          border-bottom: 1px solid #333;
        }

        .midi-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #666;
        }

        .status-dot.active {
          background: #4caf50;
          box-shadow: 0 0 6px #4caf50;
        }

        .status-text {
          color: #aaa;
          font-size: 12px;
        }

        .clear-btn {
          background: transparent;
          border: 1px solid #444;
          color: #888;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        }

        .clear-btn:hover {
          border-color: #666;
          color: #ccc;
        }

        .midi-log {
          max-height: 200px;
          overflow-y: auto;
          padding: 8px;
        }

        .midi-monitor.compact .midi-log {
          max-height: 120px;
        }

        .empty-log {
          color: #666;
          text-align: center;
          padding: 20px;
          font-size: 12px;
        }

        .midi-entry {
          display: flex;
          gap: 8px;
          padding: 4px 8px;
          border-left: 3px solid;
          margin-bottom: 4px;
          background: #0d0d1a;
          border-radius: 0 4px 4px 0;
        }

        .entry-channel {
          color: #888;
          font-size: 10px;
          min-width: 28px;
        }

        .entry-text {
          color: #eee;
          font-family: monospace;
          font-size: 12px;
        }

        .midi-monitor.compact .entry-text {
          font-size: 10px;
        }

        /* Scrollbar styling */
        .midi-log::-webkit-scrollbar {
          width: 6px;
        }

        .midi-log::-webkit-scrollbar-track {
          background: #0d0d1a;
        }

        .midi-log::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
};

export default MIDIMonitor;
