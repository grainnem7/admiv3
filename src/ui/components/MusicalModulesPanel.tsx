/**
 * Musical Modules Panel
 *
 * UI controls for the musical processing modules:
 * - Scale Quantizer
 * - Arpeggiator
 * - Sequencer
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getArpeggiator,
  type ArpPattern,
  type ArpRate,
} from '../../music/Arpeggiator';
import {
  getSequencer,
} from '../../music/Sequencer';
import { SCALES, NOTE_NAMES, type ScaleType, type NoteName, midiToNote } from '../../sound/MusicTheory';
import { getSoundEngine } from '../../sound/SoundEngine';
import { getMusicController } from '../../core/MusicController';
import { MIDIOutput } from '../../midi';
import { useAppStore } from '../../state/store';
import type { MusicScaleType } from '../../state/types';

export const MusicalModulesPanel: React.FC = () => {
  // Scale/Quantizer state - synced with music settings store
  const musicSettings = useAppStore((s) => s.musicSettings);
  const setMusicSettings = useAppStore((s) => s.setMusicSettings);
  const rootNote = musicSettings.rootNote as NoteName;
  const scaleType = musicSettings.scale as ScaleType;
  const [quantizeEnabled, setQuantizeEnabled] = useState(true);

  // Arpeggiator state
  const [arpEnabled, setArpEnabled] = useState(false);
  const [arpPattern, setArpPattern] = useState<ArpPattern>('up');
  const [arpRate, setArpRate] = useState<ArpRate>('8n');
  const [arpOctaves, setArpOctaves] = useState(1);
  const [arpGate, setArpGate] = useState(0.8);

  // Sequencer state
  const [seqPlaying, setSeqPlaying] = useState(false);
  const [seqRecording, setSeqRecording] = useState(false);
  const [seqCurrentStep, setSeqCurrentStep] = useState(0);
  const [seqStepCount, setSeqStepCount] = useState<8 | 16 | 32>(16);

  // Tempo
  const [bpm, setBpm] = useState(120);

  // Expanded sections
  const [expandedSection, setExpandedSection] = useState<'scale' | 'arp' | 'seq' | null>('scale');

  // Refs for singleton instances
  const arpeggiatorRef = useRef(getArpeggiator());
  const sequencerRef = useRef(getSequencer());
  const soundEngineRef = useRef(getSoundEngine());
  const musicControllerRef = useRef(getMusicController());
  const callbacksSetRef = useRef(false);

  // Initialize modules and connect to sound system
  useEffect(() => {
    // Only set callbacks once
    if (callbacksSetRef.current) return;
    callbacksSetRef.current = true;

    const arpeggiator = arpeggiatorRef.current;
    const sequencer = sequencerRef.current;
    const soundEngine = soundEngineRef.current;

    console.log('[MusicalModulesPanel] Setting up callbacks');

    // Connect arpeggiator to sound engine
    arpeggiator.onNote((midi, velocity, duration, isNoteOn) => {
      console.log(`[Arpeggiator] Note: ${midi}, vel: ${velocity}, on: ${isNoteOn}`);
      const noteName = midiToNote(midi);
      if (isNoteOn) {
        // Play internal sound
        soundEngine.playNote('melody', noteName, {
          velocity,
          duration: '8n',
        });
        // Send MIDI
        const channel = MIDIOutput.getConfig().channels.melody;
        MIDIOutput.sendNoteOn(midi, velocity * 127, channel);
        setTimeout(() => {
          MIDIOutput.sendNoteOff(midi, 0, channel);
        }, duration);
      }
    });

    // Connect sequencer to sound engine
    sequencer.onNote((midi, velocity, duration, _trackId, isNoteOn) => {
      console.log(`[Sequencer] Note: ${midi}, vel: ${velocity}, on: ${isNoteOn}`);
      const noteName = midiToNote(midi);
      if (isNoteOn) {
        // Play internal sound
        soundEngine.playNote('melody', noteName, {
          velocity,
          duration: '8n',
        });
        // Send MIDI
        const channel = MIDIOutput.getConfig().channels.melody;
        MIDIOutput.sendNoteOn(midi, velocity * 127, channel);
        setTimeout(() => {
          MIDIOutput.sendNoteOff(midi, 0, channel);
        }, duration);
      }
    });

    // Set up sequencer step callback for UI
    sequencer.onStep((step) => {
      setSeqCurrentStep(step);
    });

    return () => {
      // Cleanup
      arpeggiator.stop();
      arpeggiator.clear();
      sequencer.stop();
    };
  }, []);

  // Sync swing amount from music settings to arpeggiator
  useEffect(() => {
    arpeggiatorRef.current.setSwing(musicSettings.swingAmount);
  }, [musicSettings.swingAmount]);

  // Handle scale change - update MusicController and store
  const handleRootChange = useCallback((root: NoteName) => {
    setMusicSettings({ rootNote: root });
    musicControllerRef.current.setScale(root, scaleType);
  }, [scaleType, setMusicSettings]);

  const handleScaleTypeChange = useCallback((scale: ScaleType) => {
    setMusicSettings({ scale: scale as MusicScaleType });
    musicControllerRef.current.setScale(rootNote, scale);
  }, [rootNote, setMusicSettings]);

  // Handle arpeggiator changes
  const handleArpToggle = useCallback(() => {
    const arpeggiator = arpeggiatorRef.current;
    const newEnabled = !arpEnabled;
    setArpEnabled(newEnabled);

    console.log(`[MusicalModulesPanel] Arpeggiator toggle: ${newEnabled}`);

    if (newEnabled) {
      // Set BPM first
      arpeggiator.setBpm(bpm);

      // Add notes based on current scale
      const rootMidi = 60 + NOTE_NAMES.indexOf(rootNote); // C4 + offset
      const scaleIntervals = SCALES[scaleType].intervals;

      // Add first 3 notes of the scale as held notes
      scaleIntervals.slice(0, 3).forEach((interval) => {
        arpeggiator.noteOn(rootMidi + interval, 0.7);
      });

      // Enable and start
      arpeggiator.setEnabled(true);
    } else {
      arpeggiator.setEnabled(false);
      arpeggiator.clear();
    }
  }, [arpEnabled, rootNote, scaleType, bpm]);

  const handleArpPatternChange = useCallback((pattern: ArpPattern) => {
    setArpPattern(pattern);
    arpeggiatorRef.current.setPattern(pattern);
  }, []);

  const handleArpRateChange = useCallback((rate: ArpRate) => {
    setArpRate(rate);
    arpeggiatorRef.current.setRate(rate);
  }, []);

  const handleArpOctavesChange = useCallback((octaves: number) => {
    setArpOctaves(octaves);
    arpeggiatorRef.current.setOctaveRange(octaves);
  }, []);

  const handleArpGateChange = useCallback((gate: number) => {
    setArpGate(gate);
    arpeggiatorRef.current.setGateLength(gate);
  }, []);

  // Handle sequencer changes
  const handleSeqPlayToggle = useCallback(() => {
    const sequencer = sequencerRef.current;

    if (seqPlaying) {
      console.log('[MusicalModulesPanel] Stopping sequencer');
      sequencer.stop();
      setSeqPlaying(false);
      setSeqRecording(false);
    } else {
      console.log('[MusicalModulesPanel] Starting sequencer');
      sequencer.setBpm(bpm);
      sequencer.play();
      setSeqPlaying(true);
    }
  }, [seqPlaying, bpm]);

  const handleSeqRecordToggle = useCallback(() => {
    const sequencer = sequencerRef.current;

    if (seqRecording) {
      sequencer.stopRecording();
      setSeqRecording(false);
    } else {
      sequencer.startRecording();
      setSeqRecording(true);
      setSeqPlaying(true);
    }
  }, [seqRecording]);

  const handleSeqClear = useCallback(() => {
    sequencerRef.current.clearAll();
    setSeqCurrentStep(0);
  }, []);

  const handleSeqStepCountChange = useCallback((count: 8 | 16 | 32) => {
    setSeqStepCount(count);
    sequencerRef.current.setStepCount(count);
  }, []);

  // Add a test pattern to the sequencer
  const handleAddTestPattern = useCallback(() => {
    const sequencer = sequencerRef.current;
    const track = sequencer.getTrack('default');
    if (!track) {
      console.log('[MusicalModulesPanel] No default track found');
      return;
    }

    console.log('[MusicalModulesPanel] Adding test pattern');

    // Clear first
    sequencer.clearTrack('default');

    // Add a simple pattern based on scale
    const rootMidi = 60 + NOTE_NAMES.indexOf(rootNote);
    const intervals = SCALES[scaleType].intervals;

    // Add notes on beats 0, 4, 8, 12 (quarter notes in 16-step)
    [0, 4, 8, 12].forEach((step, i) => {
      if (step < seqStepCount) {
        const interval = intervals[i % intervals.length];
        sequencer.setStep('default', step, {
          midi: rootMidi + interval,
          velocity: 0.8,
          gate: 0.8,
          enabled: true,
        });
      }
    });

    console.log('[MusicalModulesPanel] Pattern added, track steps:', track.steps);
  }, [rootNote, scaleType, seqStepCount]);

  // Handle tempo change
  const handleBpmChange = useCallback((newBpm: number) => {
    const clampedBpm = Math.max(30, Math.min(300, newBpm));
    setBpm(clampedBpm);
    sequencerRef.current.setBpm(clampedBpm);
    arpeggiatorRef.current.setBpm(clampedBpm);
  }, []);

  const toggleSection = (section: 'scale' | 'arp' | 'seq') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="musical-modules-panel">
      {/* Scale/Quantizer Section */}
      <div className="module-section">
        <div
          className="module-header"
          onClick={() => toggleSection('scale')}
        >
          <span className={`expand-icon ${expandedSection === 'scale' ? 'expanded' : ''}`}>
            ▶
          </span>
          <span className="module-title">Scale / Quantizer</span>
          <span className={`module-status ${quantizeEnabled ? 'active' : ''}`}>
            {quantizeEnabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {expandedSection === 'scale' && (
          <div className="module-content">
            <div className="control-row">
              <label>Enabled</label>
              <button
                className={`toggle-btn ${quantizeEnabled ? 'active' : ''}`}
                onClick={() => setQuantizeEnabled(!quantizeEnabled)}
              >
                {quantizeEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="control-row">
              <label>Root</label>
              <select
                value={rootNote}
                onChange={(e) => handleRootChange(e.target.value as NoteName)}
              >
                {NOTE_NAMES.map((note) => (
                  <option key={note} value={note}>{note}</option>
                ))}
              </select>
            </div>

            <div className="control-row">
              <label>Scale</label>
              <select
                value={scaleType}
                onChange={(e) => handleScaleTypeChange(e.target.value as ScaleType)}
              >
                {Object.entries(SCALES).map(([type, info]) => (
                  <option key={type} value={type}>{info.name}</option>
                ))}
              </select>
            </div>

            <div className="scale-preview">
              {rootNote} {SCALES[scaleType].name}
            </div>
          </div>
        )}
      </div>

      {/* Arpeggiator Section */}
      <div className="module-section">
        <div
          className="module-header"
          onClick={() => toggleSection('arp')}
        >
          <span className={`expand-icon ${expandedSection === 'arp' ? 'expanded' : ''}`}>
            ▶
          </span>
          <span className="module-title">Arpeggiator</span>
          <span className={`module-status ${arpEnabled ? 'active' : ''}`}>
            {arpEnabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {expandedSection === 'arp' && (
          <div className="module-content">
            <div className="control-row">
              <label>Enabled</label>
              <button
                className={`toggle-btn ${arpEnabled ? 'active' : ''}`}
                onClick={handleArpToggle}
              >
                {arpEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="control-row">
              <label>Pattern</label>
              <select
                value={arpPattern}
                onChange={(e) => handleArpPatternChange(e.target.value as ArpPattern)}
                disabled={!arpEnabled}
              >
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="upDown">Up/Down</option>
                <option value="downUp">Down/Up</option>
                <option value="random">Random</option>
                <option value="played">As Played</option>
              </select>
            </div>

            <div className="control-row">
              <label>Rate</label>
              <select
                value={arpRate}
                onChange={(e) => handleArpRateChange(e.target.value as ArpRate)}
                disabled={!arpEnabled}
              >
                <option value="1n">1/1</option>
                <option value="2n">1/2</option>
                <option value="4n">1/4</option>
                <option value="8n">1/8</option>
                <option value="16n">1/16</option>
                <option value="8t">1/8T</option>
                <option value="16t">1/16T</option>
              </select>
            </div>

            <div className="control-row">
              <label>Octaves</label>
              <input
                type="range"
                min="1"
                max="4"
                value={arpOctaves}
                onChange={(e) => handleArpOctavesChange(parseInt(e.target.value))}
                disabled={!arpEnabled}
              />
              <span className="value-display">{arpOctaves}</span>
            </div>

            <div className="control-row">
              <label>Gate</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={arpGate}
                onChange={(e) => handleArpGateChange(parseFloat(e.target.value))}
                disabled={!arpEnabled}
              />
              <span className="value-display">{Math.round(arpGate * 100)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Sequencer Section */}
      <div className="module-section">
        <div
          className="module-header"
          onClick={() => toggleSection('seq')}
        >
          <span className={`expand-icon ${expandedSection === 'seq' ? 'expanded' : ''}`}>
            ▶
          </span>
          <span className="module-title">Sequencer</span>
          <span className={`module-status ${seqPlaying ? 'active' : ''}`}>
            {seqRecording ? 'REC' : seqPlaying ? 'PLAY' : 'STOP'}
          </span>
        </div>

        {expandedSection === 'seq' && (
          <div className="module-content">
            <div className="transport-controls">
              <button
                className={`transport-btn ${seqPlaying ? 'active' : ''}`}
                onClick={handleSeqPlayToggle}
              >
                {seqPlaying ? '⏹' : '▶'}
              </button>
              <button
                className={`transport-btn record ${seqRecording ? 'active' : ''}`}
                onClick={handleSeqRecordToggle}
              >
                ⏺
              </button>
              <button
                className="transport-btn"
                onClick={handleSeqClear}
              >
                Clear
              </button>
              <button
                className="transport-btn"
                onClick={handleAddTestPattern}
                title="Add test pattern"
              >
                +Pat
              </button>
            </div>

            <div className="control-row">
              <label>Steps</label>
              <div className="step-buttons">
                {([8, 16, 32] as const).map((count) => (
                  <button
                    key={count}
                    className={`step-btn ${seqStepCount === count ? 'active' : ''}`}
                    onClick={() => handleSeqStepCountChange(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="step-display">
              {Array.from({ length: seqStepCount }).map((_, i) => (
                <div
                  key={i}
                  className={`step-indicator ${i === seqCurrentStep ? 'current' : ''} ${i % 4 === 0 ? 'beat' : ''}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tempo Control */}
      <div className="tempo-control">
        <label>BPM</label>
        <input
          type="number"
          min="30"
          max="300"
          value={bpm}
          onChange={(e) => handleBpmChange(parseInt(e.target.value) || 120)}
        />
        <input
          type="range"
          min="30"
          max="300"
          value={bpm}
          onChange={(e) => handleBpmChange(parseInt(e.target.value))}
        />
      </div>
    </div>
  );
};
