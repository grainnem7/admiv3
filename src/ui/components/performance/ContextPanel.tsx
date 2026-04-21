/**
 * ContextPanel — Redesigned
 *
 * Right-side panel with polished header, smooth expand,
 * and section-specific content.
 */

import type { InputProfile, TrackedBodyPoint } from '../../../state/types';
import type { InstrumentZone, GestureSoundMapping } from '../../../state/instrumentZones';
import { Panel } from '../../design-system/Panel';
import InputProfileSelector from '../InputProfileSelector';
import VolumeControl from '../VolumeControl';
import SoundPresetSelector from '../SoundPresetSelector';
import GestureMappingPanel from '../GestureMappingPanel';
import MIDISettingsPanel from '../MIDISettingsPanel';
import EffectChainSelector from '../EffectChainSelector';
import { MusicalModulesPanel } from '../MusicalModulesPanel';
import InputMethodPanel, { type InputMethod } from '../InputMethodPanel';
import ThereminDisplay from '../ThereminDisplay';
import BodyPointsPanel from '../BodyPointsPanel';
import MusicSettingsPanel from '../MusicSettingsPanel';
import AccompanimentPanel from '../AccompanimentPanel';
import { IconX } from '../../design-system/Icons';
import { getSidebarItem, type SidebarSection } from './sidebarConfig';

interface ContextPanelProps {
  activeSection: SidebarSection;
  isOpen: boolean;
  isExpanded: boolean;
  onToggleOpen: () => void;
  onToggleExpanded: () => void;
  currentProfile: InputProfile;
  onProfileChange: (profile: InputProfile) => void;
  activeInputMethod: InputMethod;
  onInputMethodChange: (method: InputMethod) => void;
  onRequestColorCalibration: (colorId: string) => void;
  instrumentZones: InstrumentZone[];
  gestureMappings: GestureSoundMapping[];
  onGestureMappingsChange: (mappings: GestureSoundMapping[]) => void;
  isGesturePanelExpanded: boolean;
  onToggleGesturePanel: () => void;
  trackedPoints: TrackedBodyPoint[];
  onPointsChange: (points: TrackedBodyPoint[]) => void;
  isEffectPanelExpanded: boolean;
  onToggleEffectPanel: () => void;
  isMidiPanelExpanded: boolean;
  onToggleMidiPanel: () => void;
}

const SECTION_DESCRIPTIONS: Record<string, string> = {
  input: 'Choose how your body controls the instrument',
  sound: 'Adjust volume and pick the character of your sound',
  zones: 'Create areas on screen that trigger different instruments when you move through them',
  gestures: 'Map specific movements to sounds — like a pinch triggering a drum hit',
  points: 'Select which body joints are tracked and what musical parameter they control',
  effects: 'Add reverb, delay, and other processing to shape your sound',
  modules: 'Sequencer, arpeggiator, and other musical tools',
  harmony: 'Set up automatic accompaniment that follows your playing',
  music: 'Configure key, scale, tempo, and how notes are quantized',
  midi: 'Send MIDI to external software or hardware instruments',
};

function SectionHelp({ section }: { section: string }) {
  const desc = SECTION_DESCRIPTIONS[section];
  if (!desc) return null;
  return (
    <p className="panel__description" style={{
      fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)',
      lineHeight: 'var(--leading-relaxed)', margin: '0 0 var(--space-3)',
    }}>
      {desc}
    </p>
  );
}

function PanelContent(props: ContextPanelProps) {
  const { activeSection, currentProfile, onProfileChange, activeInputMethod,
    onInputMethodChange, onRequestColorCalibration, instrumentZones,
    gestureMappings, onGestureMappingsChange, isGesturePanelExpanded,
    onToggleGesturePanel, trackedPoints, onPointsChange,
    isEffectPanelExpanded, onToggleEffectPanel, isMidiPanelExpanded,
    onToggleMidiPanel, isExpanded } = props;

  switch (activeSection) {
    case 'input':
      return (
        <>
          <SectionHelp section="input" />
          <Panel title="Input Method" defaultExpanded>
            <InputMethodPanel isExpanded onToggle={() => {}}
              onInputMethodChange={onInputMethodChange}
              onRequestColorCalibration={onRequestColorCalibration} />
            {activeInputMethod === 'theremin' && (
              <div style={{ marginTop: 12 }}>
                <ThereminDisplay isActive />
              </div>
            )}
          </Panel>
          <Panel title="Input Profile" defaultExpanded>
            <InputProfileSelector currentProfile={currentProfile}
              onProfileSelect={onProfileChange} showDetails={false} />
          </Panel>
        </>
      );
    case 'sound':
      return (
        <>
          <SectionHelp section="sound" />
          <Panel title="Volume" defaultExpanded><VolumeControl /></Panel>
          <Panel title="Sound Preset" defaultExpanded><SoundPresetSelector /></Panel>
        </>
      );
    case 'zones':
      return (
        <Panel title="Instrument Zones" collapsible={false}>
          <p style={{ fontSize: 14, color: '#9898a8', marginBottom: 8, lineHeight: 1.5 }}>
            Drag instruments from the palette onto the video to create trigger zones.
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 999,
            background: 'rgba(255,255,255,0.04)',
            fontSize: 13, color: '#71718a',
          }}>
            <span style={{ fontWeight: 600, color: '#e4e4ef' }}>{instrumentZones.length}</span>
            active zone{instrumentZones.length !== 1 ? 's' : ''}
          </div>
        </Panel>
      );
    case 'gestures':
      return (
        <Panel title="Gesture Triggers" collapsible={false}>
          <SectionHelp section="gestures" />
          <GestureMappingPanel mappings={gestureMappings}
            onMappingsChange={onGestureMappingsChange}
            isExpanded={isGesturePanelExpanded} onToggle={onToggleGesturePanel}
            parentExpanded={isExpanded} />
        </Panel>
      );
    case 'points':
      return (
        <Panel title="Body Tracking" collapsible={false}>
          <SectionHelp section="points" />
          <BodyPointsPanel trackedPoints={trackedPoints}
            onPointsChange={onPointsChange} parentExpanded={isExpanded} />
        </Panel>
      );
    case 'effects':
      return (
        <Panel title="Effect Chain" collapsible={false}>
          <SectionHelp section="effects" />
          <EffectChainSelector isExpanded={isEffectPanelExpanded}
            onToggle={onToggleEffectPanel} />
        </Panel>
      );
    case 'modules':
      return <Panel title="Musical Tools" collapsible={false}><SectionHelp section="modules" /><MusicalModulesPanel /></Panel>;
    case 'harmony':
      return <Panel title="Harmony & Accompaniment" collapsible={false}><SectionHelp section="harmony" /><AccompanimentPanel /></Panel>;
    case 'music':
      return <Panel title="Music Settings" collapsible={false}><SectionHelp section="music" /><MusicSettingsPanel /></Panel>;
    case 'midi':
      return (
        <Panel title="MIDI Output" collapsible={false}>
          <SectionHelp section="midi" />
          <MIDISettingsPanel isExpanded={isMidiPanelExpanded} onToggle={onToggleMidiPanel} />
        </Panel>
      );
    default:
      return null;
  }
}

export default function ContextPanel(props: ContextPanelProps) {
  const { isOpen, isExpanded, onToggleOpen, onToggleExpanded, activeSection } = props;
  if (!isOpen) return null;

  const sidebarItem = getSidebarItem(activeSection);

  return (
    <div style={{
      width: isExpanded ? 520 : 280,
      maxWidth: isExpanded ? '50vw' : '35vw',
      display: 'flex', flexDirection: 'column',
      background: '#0e0e14',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      transition: 'width 200ms ease',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#e4e4ef' }}>
          {sidebarItem?.label || 'Controls'}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={onToggleExpanded}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: isExpanded ? 'rgba(249,115,22,0.10)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isExpanded ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)'}`,
              color: isExpanded ? '#f97316' : '#71718a', cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            {isExpanded ? 'Narrow' : 'Expand'}
          </button>
          <button
            onClick={onToggleOpen}
            aria-label="Close panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#71718a', cursor: 'pointer', fontSize: 12,
              transition: 'all 120ms ease',
            }}
          >
            <IconX size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 12,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <PanelContent {...props} />
      </div>
    </div>
  );
}
