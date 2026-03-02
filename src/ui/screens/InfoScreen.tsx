/**
 * Info Screen - Professional Documentation & Conference Presentation
 *
 * Academic/conference-ready presentation explaining ADMI architecture
 * with technical diagrams and professional styling.
 */

import { useState } from 'react';
import { useAppStore } from '../../state/store';

// Slide data
interface Slide {
  id: string;
  title: string;
  content: React.ReactNode;
}

// Professional color palette - Light theme for conference presentation
// Darker accent colors for better white text readability
const colors = {
  bg: '#f8f9fa',
  bgRaised: '#ffffff',
  bgCard: '#f0f1f3',
  border: '#e0e0e0',
  borderLight: '#d0d0d0',
  primary: '#ea580c', // Darker orange
  primaryDim: '#c2410c',
  text: '#1a1a1a',
  textSecondary: '#4a4a4a',
  textTertiary: '#6a6a6a',
  accent1: '#1d4ed8', // Darker blue
  accent2: '#0f766e', // Darker teal
  accent3: '#7c3aed', // Darker purple
  accent4: '#15803d', // Darker green
  accent5: '#b91c1c', // Darker red
};

// Inline styles
const styles = {
  container: {
    position: 'fixed' as const,
    inset: 0,
    background: colors.bg,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 32px',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.bgRaised,
  },
  logo: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textSecondary,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
  },
  nav: {
    display: 'flex',
    gap: '4px',
  },
  navBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  navBtnActive: {
    background: colors.primary,
    borderColor: colors.primary,
    color: colors.text,
  },
  closeBtn: {
    padding: '8px 20px',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    fontSize: '12px',
    cursor: 'pointer',
  },
  slideContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    overflow: 'auto',
  },
  slide: {
    width: '100%',
    maxWidth: '1400px',
    background: colors.bgRaised,
    border: `1px solid ${colors.border}`,
    padding: '48px 64px',
    minHeight: '680px',
  },
  slideHeader: {
    marginBottom: '40px',
    paddingBottom: '24px',
    borderBottom: `1px solid ${colors.border}`,
  },
  slideTitle: {
    fontSize: '32px',
    fontWeight: 700,
    color: colors.text,
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  slideSubtitle: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontWeight: 400,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 32px',
    borderTop: `1px solid ${colors.border}`,
    background: colors.bgRaised,
  },
  pageIndicator: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  pageText: {
    fontSize: '12px',
    color: colors.textTertiary,
    marginRight: '12px',
  },
  dot: {
    width: '8px',
    height: '8px',
    background: colors.border,
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  dotActive: {
    background: colors.primary,
  },
  arrowBtn: {
    padding: '10px 24px',
    background: colors.primary,
    border: 'none',
    color: colors.text,
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  arrowBtnDisabled: {
    background: colors.bgCard,
    color: colors.textTertiary,
    cursor: 'not-allowed',
  },
  // Content styles
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginBottom: '16px',
  },
  paragraph: {
    fontSize: '15px',
    color: colors.textSecondary,
    lineHeight: 1.7,
    maxWidth: '800px',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '32px',
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
  },
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
  },
  card: {
    background: colors.bgCard,
    border: `1px solid ${colors.borderLight}`,
    padding: '24px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: colors.text,
    marginBottom: '8px',
  },
  cardText: {
    fontSize: '13px',
    color: colors.textSecondary,
    lineHeight: 1.6,
  },
  statNumber: {
    fontSize: '36px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '12px',
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  diagramContainer: {
    background: colors.bgCard,
    border: `1px solid ${colors.borderLight}`,
    padding: '32px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableRow: {
    display: 'flex',
    borderBottom: `1px solid ${colors.border}`,
  },
  tableCell: {
    padding: '12px 16px',
    fontSize: '13px',
    color: colors.textSecondary,
  },
  tableHeader: {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 600,
    color: colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    background: colors.bgCard,
  },
};

// SVG Components for diagrams
const BodyDiagram = () => (
  <svg width="280" height="400" viewBox="0 0 280 400">
    {/* Head */}
    <ellipse cx="140" cy="45" rx="28" ry="35" fill="none" stroke={colors.accent1} strokeWidth="2" />
    <circle cx="125" cy="38" r="4" fill={colors.accent1} />
    <circle cx="155" cy="38" r="4" fill={colors.accent1} />
    <circle cx="140" cy="52" r="3" fill={colors.accent1} />
    <text x="180" y="45" fill={colors.textTertiary} fontSize="10">Face (478 pts)</text>

    {/* Neck to torso */}
    <line x1="140" y1="80" x2="140" y2="100" stroke={colors.accent2} strokeWidth="2" />

    {/* Shoulders */}
    <line x1="80" y1="110" x2="200" y2="110" stroke={colors.accent2} strokeWidth="2" />
    <circle cx="80" cy="110" r="6" fill={colors.accent2} />
    <circle cx="200" cy="110" r="6" fill={colors.accent2} />
    <text x="205" y="115" fill={colors.textTertiary} fontSize="10">Shoulders</text>

    {/* Spine */}
    <line x1="140" y1="100" x2="140" y2="200" stroke={colors.accent2} strokeWidth="2" />

    {/* Arms */}
    <line x1="80" y1="110" x2="50" y2="170" stroke={colors.accent2} strokeWidth="2" />
    <line x1="50" y1="170" x2="30" y2="240" stroke={colors.accent2} strokeWidth="2" />
    <circle cx="50" cy="170" r="5" fill={colors.accent2} />
    <circle cx="30" cy="240" r="6" fill={colors.accent4} />
    <text x="5" y="260" fill={colors.textTertiary} fontSize="10">L Wrist</text>

    <line x1="200" y1="110" x2="230" y2="170" stroke={colors.accent2} strokeWidth="2" />
    <line x1="230" y1="170" x2="250" y2="240" stroke={colors.accent2} strokeWidth="2" />
    <circle cx="230" cy="170" r="5" fill={colors.accent2} />
    <circle cx="250" cy="240" r="6" fill={colors.accent4} />
    <text x="255" y="245" fill={colors.textTertiary} fontSize="10">R Wrist</text>

    {/* Hips */}
    <line x1="100" y1="200" x2="180" y2="200" stroke={colors.accent2} strokeWidth="2" />
    <circle cx="100" cy="200" r="5" fill={colors.accent2} />
    <circle cx="180" cy="200" r="5" fill={colors.accent2} />

    {/* Legs */}
    <line x1="100" y1="200" x2="90" y2="280" stroke={colors.accent2} strokeWidth="2" />
    <line x1="90" y1="280" x2="85" y2="360" stroke={colors.accent2} strokeWidth="2" />
    <circle cx="90" cy="280" r="5" fill={colors.accent2} />
    <circle cx="85" cy="360" r="5" fill={colors.accent2} />

    <line x1="180" y1="200" x2="190" y2="280" stroke={colors.accent2} strokeWidth="2" />
    <line x1="190" y1="280" x2="195" y2="360" stroke={colors.accent2} strokeWidth="2" />
    <circle cx="190" cy="280" r="5" fill={colors.accent2} />
    <circle cx="195" cy="360" r="5" fill={colors.accent2} />

    {/* Hand detail boxes */}
    <rect x="5" y="270" width="50" height="60" fill="none" stroke={colors.accent5} strokeWidth="1" strokeDasharray="4 2" />
    <text x="8" y="285" fill={colors.accent5} fontSize="9">21 pts</text>
    <text x="8" y="320" fill={colors.textTertiary} fontSize="8">L Hand</text>

    <rect x="225" y="250" width="50" height="60" fill="none" stroke={colors.accent4} strokeWidth="1" strokeDasharray="4 2" />
    <text x="228" y="265" fill={colors.accent4} fontSize="9">21 pts</text>
    <text x="228" y="300" fill={colors.textTertiary} fontSize="8">R Hand</text>
  </svg>
);

// Pipeline diagram - colorful solid boxes
const SystemArchitectureDiagram = () => (
  <svg width="820" height="120" viewBox="0 0 820 120">
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill={colors.text} />
      </marker>
    </defs>

    {/* Stage 1: Webcam - solid color fill */}
    <rect x="0" y="20" width="130" height="80" fill={colors.accent1} rx="4" />
    <text x="65" y="55" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">WEBCAM</text>
    <text x="65" y="75" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="11">Video input</text>

    {/* Arrow 1 */}
    <line x1="130" y1="60" x2="163" y2="60" stroke={colors.text} strokeWidth="2" markerEnd="url(#arrow)" />

    {/* Stage 2: MediaPipe */}
    <rect x="170" y="20" width="140" height="80" fill={colors.accent2} rx="4" />
    <text x="240" y="55" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">MEDIAPIPE</text>
    <text x="240" y="75" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="11">553 landmarks</text>

    {/* Arrow 2 */}
    <line x1="310" y1="60" x2="343" y2="60" stroke={colors.text} strokeWidth="2" markerEnd="url(#arrow)" />

    {/* Stage 3: Processor */}
    <rect x="350" y="20" width="140" height="80" fill={colors.accent3} rx="4" />
    <text x="420" y="50" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">PROCESSOR</text>
    <text x="420" y="70" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="11">Feature Extraction</text>
    <text x="420" y="88" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="10">Velocity + Gestures</text>

    {/* Arrow 3 */}
    <line x1="490" y1="60" x2="523" y2="60" stroke={colors.text} strokeWidth="2" markerEnd="url(#arrow)" />

    {/* Stage 4: Mapping */}
    <rect x="530" y="20" width="130" height="80" fill={colors.primary} rx="4" />
    <text x="595" y="50" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">MAPPING</text>
    <text x="595" y="70" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="11">Position → Sound</text>
    <text x="595" y="88" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="10">Linear / Exp curves</text>

    {/* Arrow 4 */}
    <line x1="660" y1="60" x2="693" y2="60" stroke={colors.text} strokeWidth="2" markerEnd="url(#arrow)" />

    {/* Stage 5: Audio */}
    <rect x="700" y="20" width="110" height="80" fill={colors.accent4} rx="4" />
    <text x="755" y="50" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">AUDIO</text>
    <text x="755" y="70" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="11">Tone.js</text>
    <text x="755" y="88" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="10">&lt;10ms latency</text>
  </svg>
);

const MappingDiagram = () => (
  <svg width="600" height="300" viewBox="0 0 600 300">
    {/* Input side */}
    <text x="20" y="25" fill={colors.textSecondary} fontSize="12" fontWeight="600">INPUT (Body Position)</text>

    <rect x="20" y="40" width="150" height="240" fill={colors.bgCard} stroke={colors.borderLight} strokeWidth="1" />

    {/* Y axis label */}
    <text x="35" y="160" fill={colors.textTertiary} fontSize="10" transform="rotate(-90, 35, 160)">Y Position (0.0 - 1.0)</text>

    {/* Grid lines */}
    <line x1="50" y1="60" x2="160" y2="60" stroke={colors.border} strokeWidth="1" />
    <line x1="50" y1="120" x2="160" y2="120" stroke={colors.border} strokeWidth="1" />
    <line x1="50" y1="180" x2="160" y2="180" stroke={colors.border} strokeWidth="1" />
    <line x1="50" y1="240" x2="160" y2="240" stroke={colors.border} strokeWidth="1" />

    <text x="165" y="64" fill={colors.textTertiary} fontSize="9">0.0</text>
    <text x="165" y="124" fill={colors.textTertiary} fontSize="9">0.33</text>
    <text x="165" y="184" fill={colors.textTertiary} fontSize="9">0.66</text>
    <text x="165" y="244" fill={colors.textTertiary} fontSize="9">1.0</text>

    {/* Moving point */}
    <circle cx="105" cy="150" r="12" fill={colors.primary} />
    <text x="105" y="155" textAnchor="middle" fill={colors.text} fontSize="10" fontWeight="600">P</text>

    {/* Arrow */}
    <line x1="200" y1="160" x2="280" y2="160" stroke={colors.textTertiary} strokeWidth="2" markerEnd="url(#arrow)" />
    <text x="240" y="150" textAnchor="middle" fill={colors.textTertiary} fontSize="10">mapping</text>

    {/* Output side */}
    <text x="300" y="25" fill={colors.textSecondary} fontSize="12" fontWeight="600">OUTPUT (Sound Parameters)</text>

    {/* Pitch output */}
    <rect x="300" y="40" width="280" height="70" fill={colors.bgCard} stroke={colors.accent1} strokeWidth="1" />
    <text x="315" y="60" fill={colors.accent1} fontSize="11" fontWeight="600">PITCH</text>
    <text x="315" y="78" fill={colors.textTertiary} fontSize="10">Y position mapped to MIDI notes (C2-C6)</text>
    <rect x="315" y="88" width="250" height="12" fill={colors.bg} />
    <rect x="315" y="88" width="125" height="12" fill={colors.accent1} />
    <text x="320" y="97" fill={colors.text} fontSize="9">E4</text>

    {/* Volume output */}
    <rect x="300" y="120" width="280" height="70" fill={colors.bgCard} stroke={colors.accent4} strokeWidth="1" />
    <text x="315" y="140" fill={colors.accent4} fontSize="11" fontWeight="600">VOLUME</text>
    <text x="315" y="158" fill={colors.textTertiary} fontSize="10">Position mapped to amplitude (0-100%)</text>
    <rect x="315" y="168" width="250" height="12" fill={colors.bg} />
    <rect x="315" y="168" width="175" height="12" fill={colors.accent4} />
    <text x="320" y="177" fill={colors.text} fontSize="9">70%</text>

    {/* Filter output */}
    <rect x="300" y="200" width="280" height="70" fill={colors.bgCard} stroke={colors.accent3} strokeWidth="1" />
    <text x="315" y="220" fill={colors.accent3} fontSize="11" fontWeight="600">FILTER CUTOFF</text>
    <text x="315" y="238" fill={colors.textTertiary} fontSize="10">Position mapped to frequency (200Hz-8kHz)</text>
    <rect x="315" y="248" width="250" height="12" fill={colors.bg} />
    <rect x="315" y="248" width="100" height="12" fill={colors.accent3} />
    <text x="320" y="257" fill={colors.text} fontSize="9">2.1kHz</text>
  </svg>
);

const ZonesDiagram = () => (
  <svg width="500" height="320" viewBox="0 0 500 320">
    {/* Video frame */}
    <rect x="20" y="20" width="460" height="280" fill={colors.bg} stroke={colors.borderLight} strokeWidth="2" />
    <text x="40" y="45" fill={colors.textTertiary} fontSize="10">Camera View (640 x 480)</text>

    {/* Zones */}
    <rect x="40" y="60" width="100" height="80" fill="rgba(239, 68, 68, 0.15)" stroke={colors.accent5} strokeWidth="2" />
    <text x="90" y="95" textAnchor="middle" fill={colors.accent5} fontSize="11" fontWeight="600">ZONE 1</text>
    <text x="90" y="110" textAnchor="middle" fill={colors.textTertiary} fontSize="9">Kick Drum</text>
    <text x="90" y="125" textAnchor="middle" fill={colors.textTertiary} fontSize="9">oneshot</text>

    <rect x="160" y="60" width="100" height="80" fill="rgba(59, 130, 246, 0.15)" stroke={colors.accent1} strokeWidth="2" />
    <text x="210" y="95" textAnchor="middle" fill={colors.accent1} fontSize="11" fontWeight="600">ZONE 2</text>
    <text x="210" y="110" textAnchor="middle" fill={colors.textTertiary} fontSize="9">Snare</text>
    <text x="210" y="125" textAnchor="middle" fill={colors.textTertiary} fontSize="9">oneshot</text>

    <rect x="280" y="60" width="100" height="80" fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth="2" />
    <text x="330" y="95" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="600">ZONE 3</text>
    <text x="330" y="110" textAnchor="middle" fill={colors.textTertiary} fontSize="9">Hi-Hat</text>
    <text x="330" y="125" textAnchor="middle" fill={colors.textTertiary} fontSize="9">oneshot</text>

    <rect x="350" y="160" width="110" height="120" fill="rgba(168, 85, 247, 0.15)" stroke={colors.accent3} strokeWidth="2" />
    <text x="405" y="210" textAnchor="middle" fill={colors.accent3} fontSize="11" fontWeight="600">ZONE 4</text>
    <text x="405" y="225" textAnchor="middle" fill={colors.textTertiary} fontSize="9">Synth Pad</text>
    <text x="405" y="240" textAnchor="middle" fill={colors.textTertiary} fontSize="9">sustained</text>

    {/* Person silhouette */}
    <ellipse cx="200" cy="200" rx="25" ry="30" fill="none" stroke={colors.accent2} strokeWidth="2" />
    <line x1="200" y1="230" x2="200" y2="280" stroke={colors.accent2} strokeWidth="2" />
    <line x1="200" y1="245" x2="160" y2="200" stroke={colors.accent2} strokeWidth="2" />
    <line x1="200" y1="245" x2="240" y2="200" stroke={colors.accent2} strokeWidth="2" />

    {/* Hand entering zone */}
    <circle cx="330" cy="100" r="8" fill={colors.accent4} stroke={colors.text} strokeWidth="2" />
    <line x1="240" y1="200" x2="330" y2="100" stroke={colors.accent2} strokeWidth="2" strokeDasharray="6 3" />

    {/* Legend */}
    <rect x="40" y="260" width="8" height="8" fill={colors.accent4} />
    <text x="55" y="268" fill={colors.textSecondary} fontSize="10">Tracked point entering zone triggers sound</text>
  </svg>
);

// Slide Components
const TitleSlide = () => (
  <div style={{ textAlign: 'center', padding: '60px 0' }}>
    <div style={{
      fontSize: '14px',
      color: colors.textTertiary,
      letterSpacing: '3px',
      textTransform: 'uppercase',
      marginBottom: '24px'
    }}>
      Accessible Digital Musical Instrument
    </div>
    <h1 style={{
      fontSize: '72px',
      fontWeight: 800,
      color: colors.primary,
      marginBottom: '16px',
      letterSpacing: '-2px'
    }}>
      ADMI
    </h1>
    <p style={{
      fontSize: '20px',
      color: colors.textSecondary,
      marginBottom: '48px',
      maxWidth: '600px',
      margin: '0 auto 48px'
    }}>
      A browser-based musical instrument using computer vision for gesture-controlled sound synthesis
    </p>

    <div style={styles.diagramContainer}>
      <SystemArchitectureDiagram />
    </div>

    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: '48px',
      marginTop: '32px'
    }}>
      <div>
        <div style={{ ...styles.statNumber, color: colors.accent1 }}>553</div>
        <div style={styles.statLabel}>Tracked Points</div>
      </div>
      <div>
        <div style={{ ...styles.statNumber, color: colors.accent2 }}>30+</div>
        <div style={styles.statLabel}>FPS Processing</div>
      </div>
      <div>
        <div style={{ ...styles.statNumber, color: colors.primary }}>4</div>
        <div style={styles.statLabel}>Tracking Modes</div>
      </div>
      <div>
        <div style={{ ...styles.statNumber, color: colors.accent4 }}>&lt;50ms</div>
        <div style={styles.statLabel}>Latency</div>
      </div>
    </div>
  </div>
);

const ArchitectureSlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>System Architecture</h2>
      <p style={styles.slideSubtitle}>Real-time processing pipeline from camera input to audio output</p>
    </div>

    <div style={{ ...styles.diagramContainer, padding: '24px 16px', background: colors.bgRaised }}>
      <SystemArchitectureDiagram />
    </div>

    {/* Colorful detail cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginTop: '24px' }}>
      {/* Camera */}
      <div style={{ background: colors.accent1, padding: '16px', borderRadius: '4px' }}>
        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>CAMERA</div>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '11px', lineHeight: 1.5 }}>
          WebRTC getUserMedia<br />
          640×480 @ 30fps<br />
          RGB video frames
        </div>
      </div>

      {/* MediaPipe */}
      <div style={{ background: colors.accent2, padding: '16px', borderRadius: '4px' }}>
        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>MEDIAPIPE</div>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '11px', lineHeight: 1.5 }}>
          WebAssembly runtime<br />
          Pose: 33 landmarks<br />
          Hands: 21 × 2<br />
          Face: 478 landmarks
        </div>
      </div>

      {/* Processor */}
      <div style={{ background: colors.accent3, padding: '16px', borderRadius: '4px' }}>
        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>PROCESSOR</div>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '11px', lineHeight: 1.5 }}>
          Velocity calculation<br />
          Pinch detection<br />
          Blink detection<br />
          Zone collision
        </div>
      </div>

      {/* Mapping */}
      <div style={{ background: colors.primary, padding: '16px', borderRadius: '4px' }}>
        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>MAPPING</div>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '11px', lineHeight: 1.5 }}>
          Position → Pitch<br />
          Position → Volume<br />
          Linear/Exp curves<br />
          Range calibration
        </div>
      </div>

      {/* Audio */}
      <div style={{ background: colors.accent4, padding: '16px', borderRadius: '4px' }}>
        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>AUDIO</div>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '11px', lineHeight: 1.5 }}>
          Tone.js engine<br />
          Web Audio API<br />
          Drum samples<br />
          MIDI output (opt.)
        </div>
      </div>
    </div>

    {/* Stats row */}
    <div style={{
      marginTop: '24px',
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: '12px'
    }}>
      <div style={{ background: `${colors.accent1}20`, padding: '16px', textAlign: 'center', borderLeft: `4px solid ${colors.accent1}` }}>
        <div style={{ fontSize: '28px', fontWeight: 800, color: colors.accent1 }}>553</div>
        <div style={{ fontSize: '11px', color: colors.text, fontWeight: 500 }}>Total Landmarks</div>
      </div>
      <div style={{ background: `${colors.accent2}20`, padding: '16px', textAlign: 'center', borderLeft: `4px solid ${colors.accent2}` }}>
        <div style={{ fontSize: '28px', fontWeight: 800, color: colors.accent2 }}>30+</div>
        <div style={{ fontSize: '11px', color: colors.text, fontWeight: 500 }}>FPS Processing</div>
      </div>
      <div style={{ background: `${colors.accent3}20`, padding: '16px', textAlign: 'center', borderLeft: `4px solid ${colors.accent3}` }}>
        <div style={{ fontSize: '28px', fontWeight: 800, color: colors.accent3 }}>&lt;50ms</div>
        <div style={{ fontSize: '11px', color: colors.text, fontWeight: 500 }}>End-to-End</div>
      </div>
      <div style={{ background: `${colors.primary}20`, padding: '16px', textAlign: 'center', borderLeft: `4px solid ${colors.primary}` }}>
        <div style={{ fontSize: '28px', fontWeight: 800, color: colors.primary }}>4</div>
        <div style={{ fontSize: '11px', color: colors.text, fontWeight: 500 }}>Modalities</div>
      </div>
      <div style={{ background: `${colors.accent4}20`, padding: '16px', textAlign: 'center', borderLeft: `4px solid ${colors.accent4}` }}>
        <div style={{ fontSize: '28px', fontWeight: 800, color: colors.accent4 }}>0</div>
        <div style={{ fontSize: '11px', color: colors.text, fontWeight: 500 }}>Server Required</div>
      </div>
    </div>
  </div>
);

const TrackingSlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>Body Tracking System</h2>
      <p style={styles.slideSubtitle}>Multi-modal landmark detection for comprehensive body tracking</p>
    </div>

    <div style={styles.grid2}>
      <div style={styles.diagramContainer}>
        <BodyDiagram />
      </div>

      <div>
        <div style={styles.sectionTitle}>Tracking Modalities</div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, marginBottom: '12px' }}>
            <div style={{ ...styles.tableRow, background: colors.bgCard }}>
              <div style={{ ...styles.tableHeader, flex: 2 }}>Modality</div>
              <div style={{ ...styles.tableHeader, flex: 1 }}>Points</div>
              <div style={{ ...styles.tableHeader, flex: 2 }}>Detection</div>
            </div>
            <div style={styles.tableRow}>
              <div style={{ ...styles.tableCell, flex: 2, color: colors.accent2 }}>Pose (BlazePose)</div>
              <div style={{ ...styles.tableCell, flex: 1 }}>33</div>
              <div style={{ ...styles.tableCell, flex: 2 }}>Full body skeleton</div>
            </div>
            <div style={styles.tableRow}>
              <div style={{ ...styles.tableCell, flex: 2, color: colors.accent5 }}>Left Hand</div>
              <div style={{ ...styles.tableCell, flex: 1 }}>21</div>
              <div style={{ ...styles.tableCell, flex: 2 }}>Finger articulation</div>
            </div>
            <div style={styles.tableRow}>
              <div style={{ ...styles.tableCell, flex: 2, color: colors.accent4 }}>Right Hand</div>
              <div style={{ ...styles.tableCell, flex: 1 }}>21</div>
              <div style={{ ...styles.tableCell, flex: 2 }}>Finger articulation</div>
            </div>
            <div style={{ ...styles.tableRow, borderBottom: 'none' }}>
              <div style={{ ...styles.tableCell, flex: 2, color: colors.accent1 }}>Face Mesh</div>
              <div style={{ ...styles.tableCell, flex: 1 }}>478</div>
              <div style={{ ...styles.tableCell, flex: 2 }}>Facial landmarks + blendshapes</div>
            </div>
          </div>
        </div>

        <div style={styles.sectionTitle}>Coordinate System</div>
        <p style={{ ...styles.cardText, marginBottom: '16px' }}>
          All landmark positions are normalized to [0, 1] range relative to the video frame dimensions.
          Coordinates are pre-mirrored to match the user's perspective in the webcam view.
        </p>

        <div style={styles.sectionTitle}>Gesture Detection</div>
        <p style={styles.cardText}>
          Built-in gesture detection includes: pinch (thumb-index distance), blink (eye aspect ratio),
          brow raise (brow position delta), and mouth open (jaw blendshape). Custom gestures can be
          defined via landmark distance thresholds.
        </p>
      </div>
    </div>
  </div>
);

const MappingSlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>Parameter Mapping</h2>
      <p style={styles.slideSubtitle}>Continuous control of sound parameters through body position</p>
    </div>

    <div style={styles.diagramContainer}>
      <MappingDiagram />
    </div>

    <div style={{ ...styles.grid3, marginTop: '32px' }}>
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Mapping Curves</div>
        <div style={styles.cardText}>
          Linear, exponential, logarithmic, and step curves available for natural-feeling parameter response.
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Axis Selection</div>
        <div style={styles.cardText}>
          Map X (horizontal), Y (vertical), or computed values like distance and angle between points.
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Range Configuration</div>
        <div style={styles.cardText}>
          Define input ranges (body position bounds) and output ranges (parameter min/max) for precise control.
        </div>
      </div>
    </div>
  </div>
);

const ZonesSlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>Spatial Trigger Zones</h2>
      <p style={styles.slideSubtitle}>Screen regions that trigger sounds when entered by tracked body parts</p>
    </div>

    <div style={styles.grid2}>
      <div style={styles.diagramContainer}>
        <ZonesDiagram />
      </div>

      <div>
        <div style={styles.sectionTitle}>Zone Properties</div>
        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={styles.cardTitle}>Trigger Behavior</div>
          <div style={styles.cardText}>
            Zones detect collision with any tracked landmark. On entry, the assigned sound triggers.
            Configurable cooldown prevents rapid re-triggering. Exit events can trigger separate sounds.
          </div>
        </div>

        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={styles.cardTitle}>Sound Types</div>
          <div style={styles.cardText}>
            One-shot samples (drums, percussion), sustained sounds (synth pads),
            or MIDI note events for external instrument control.
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Visual Feedback</div>
          <div style={styles.cardText}>
            Zones display activation state with color changes. Tracked points show collision
            indicators when approaching or entering zones.
          </div>
        </div>
      </div>
    </div>
  </div>
);

const AccessibilitySlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>Accessibility Features</h2>
      <p style={styles.slideSubtitle}>Configurable input profiles for diverse mobility and interaction needs</p>
    </div>

    <div style={styles.grid3}>
      <div style={{ ...styles.card, borderColor: colors.accent1 }}>
        <div style={{ ...styles.cardTitle, color: colors.accent1 }}>Full Body Mode</div>
        <div style={styles.cardText}>
          Tracks all 33 pose landmarks plus hands and face. Maximum expressiveness for users with
          full range of motion.
        </div>
      </div>
      <div style={{ ...styles.card, borderColor: colors.accent4 }}>
        <div style={{ ...styles.cardTitle, color: colors.accent4 }}>Hands Only Mode</div>
        <div style={styles.cardText}>
          Focused hand tracking with 21 landmarks per hand. Optimized for seated use or users
          with limited lower body mobility.
        </div>
      </div>
      <div style={{ ...styles.card, borderColor: colors.accent3 }}>
        <div style={{ ...styles.cardTitle, color: colors.accent3 }}>Face Only Mode</div>
        <div style={styles.cardText}>
          Face mesh with expression detection via blendshapes. Enables musical control through
          facial movements and expressions.
        </div>
      </div>
    </div>

    <div style={{ marginTop: '32px' }}>
      <div style={styles.sectionTitle}>Adaptive Parameters</div>
      <div style={{ ...styles.grid4, marginTop: '16px' }}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Sensitivity</div>
          <div style={styles.cardText}>Adjust movement range required to trigger full parameter range.</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Range Calibration</div>
          <div style={styles.cardText}>Define comfortable movement bounds per user.</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Dwell Triggers</div>
          <div style={styles.cardText}>Hold position to trigger instead of requiring movement.</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Velocity Threshold</div>
          <div style={styles.cardText}>Filter out unintentional movements below threshold.</div>
        </div>
      </div>
    </div>
  </div>
);

const TechnicalSlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>Technical Implementation</h2>
      <p style={styles.slideSubtitle}>Technology stack and performance characteristics</p>
    </div>

    <div style={styles.grid2}>
      <div>
        <div style={styles.sectionTitle}>Frontend Stack</div>
        <div style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, marginBottom: '24px' }}>
          <div style={{ ...styles.tableRow, background: colors.bgCard }}>
            <div style={{ ...styles.tableHeader, flex: 1 }}>Component</div>
            <div style={{ ...styles.tableHeader, flex: 2 }}>Technology</div>
          </div>
          <div style={styles.tableRow}>
            <div style={{ ...styles.tableCell, flex: 1 }}>Framework</div>
            <div style={{ ...styles.tableCell, flex: 2 }}>React 18 + TypeScript</div>
          </div>
          <div style={styles.tableRow}>
            <div style={{ ...styles.tableCell, flex: 1 }}>Build</div>
            <div style={{ ...styles.tableCell, flex: 2 }}>Vite</div>
          </div>
          <div style={styles.tableRow}>
            <div style={{ ...styles.tableCell, flex: 1 }}>Vision</div>
            <div style={{ ...styles.tableCell, flex: 2 }}>MediaPipe Vision Tasks (WASM)</div>
          </div>
          <div style={styles.tableRow}>
            <div style={{ ...styles.tableCell, flex: 1 }}>Audio</div>
            <div style={{ ...styles.tableCell, flex: 2 }}>Tone.js + Web Audio API</div>
          </div>
          <div style={{ ...styles.tableRow, borderBottom: 'none' }}>
            <div style={{ ...styles.tableCell, flex: 1 }}>State</div>
            <div style={{ ...styles.tableCell, flex: 2 }}>Zustand</div>
          </div>
        </div>

        <div style={styles.sectionTitle}>Output Options</div>
        <div style={styles.card}>
          <div style={styles.cardText}>
            Internal synthesis via Tone.js with configurable oscillators and effects.
            Web MIDI API output for external DAW/instrument control.
            Sample playback for drum kits and one-shot sounds.
          </div>
        </div>
      </div>

      <div>
        <div style={styles.sectionTitle}>Performance Metrics</div>
        <div style={{ ...styles.grid2, marginBottom: '24px' }}>
          <div style={{ ...styles.card, textAlign: 'center' }}>
            <div style={{ ...styles.statNumber, color: colors.accent4, fontSize: '28px' }}>30-60</div>
            <div style={styles.statLabel}>FPS Tracking</div>
          </div>
          <div style={{ ...styles.card, textAlign: 'center' }}>
            <div style={{ ...styles.statNumber, color: colors.accent2, fontSize: '28px' }}>&lt;50ms</div>
            <div style={styles.statLabel}>End-to-end Latency</div>
          </div>
        </div>

        <div style={styles.sectionTitle}>Browser Support</div>
        <div style={styles.card}>
          <div style={styles.cardText}>
            Chrome, Edge, and Firefox on desktop. Requires WebRTC (camera), Web Audio,
            and WebAssembly support. Optional Web MIDI for external output.
          </div>
        </div>

        <div style={{ ...styles.sectionTitle, marginTop: '24px' }}>Deployment</div>
        <div style={styles.card}>
          <div style={styles.cardText}>
            Fully client-side application with no server requirements. Static hosting compatible.
            All ML inference runs locally in the browser via WebAssembly.
          </div>
        </div>
      </div>
    </div>
  </div>
);

// MIDI Integration Diagram
const MidiIntegrationDiagram = () => (
  <svg width="700" height="200" viewBox="0 0 700 200">
    {/* ADMI Box */}
    <rect x="10" y="60" width="140" height="80" fill={colors.bgCard} stroke={colors.primary} strokeWidth="2" />
    <text x="80" y="95" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">ADMI</text>
    <text x="80" y="115" textAnchor="middle" fill={colors.textTertiary} fontSize="10">Body Tracking</text>

    {/* Web MIDI API Box */}
    <rect x="200" y="60" width="120" height="80" fill={colors.bgCard} stroke={colors.accent2} strokeWidth="2" />
    <text x="260" y="95" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">Web MIDI</text>
    <text x="260" y="115" textAnchor="middle" fill={colors.textTertiary} fontSize="10">API</text>

    {/* Virtual MIDI Box */}
    <rect x="370" y="60" width="120" height="80" fill={colors.bgCard} stroke={colors.accent3} strokeWidth="2" />
    <text x="430" y="95" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">Virtual MIDI</text>
    <text x="430" y="115" textAnchor="middle" fill={colors.textTertiary} fontSize="10">loopMIDI / IAC</text>

    {/* DAW Box */}
    <rect x="540" y="40" width="150" height="120" fill={colors.bgCard} stroke={colors.accent1} strokeWidth="2" />
    <text x="615" y="75" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">DAW</text>
    <text x="615" y="95" textAnchor="middle" fill={colors.textTertiary} fontSize="10">Ableton Live</text>
    <text x="615" y="110" textAnchor="middle" fill={colors.textTertiary} fontSize="10">Logic Pro</text>
    <text x="615" y="125" textAnchor="middle" fill={colors.textTertiary} fontSize="10">FL Studio</text>

    {/* Arrows */}
    <defs>
      <marker id="arrow2" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill={colors.textTertiary} />
      </marker>
    </defs>
    <line x1="150" y1="100" x2="190" y2="100" stroke={colors.textTertiary} strokeWidth="2" markerEnd="url(#arrow2)" />
    <line x1="320" y1="100" x2="360" y2="100" stroke={colors.textTertiary} strokeWidth="2" markerEnd="url(#arrow2)" />
    <line x1="490" y1="100" x2="530" y2="100" stroke={colors.textTertiary} strokeWidth="2" markerEnd="url(#arrow2)" />

    {/* Data labels */}
    <text x="170" y="85" textAnchor="middle" fill={colors.textTertiary} fontSize="9">notes</text>
    <text x="340" y="85" textAnchor="middle" fill={colors.textTertiary} fontSize="9">MIDI</text>
    <text x="510" y="85" textAnchor="middle" fill={colors.textTertiary} fontSize="9">CC/notes</text>
  </svg>
);

// Ableton Workflow Diagram
const AbletonWorkflowDiagram = () => (
  <svg width="600" height="280" viewBox="0 0 600 280">
    {/* ADMI generates */}
    <rect x="20" y="20" width="180" height="100" fill={colors.bgCard} stroke={colors.primary} strokeWidth="2" />
    <text x="110" y="50" textAnchor="middle" fill={colors.text} fontSize="13" fontWeight="600">ADMI Output</text>
    <text x="110" y="75" textAnchor="middle" fill={colors.textTertiary} fontSize="10">MIDI Notes (pitch)</text>
    <text x="110" y="92" textAnchor="middle" fill={colors.textTertiary} fontSize="10">CC Messages (expression)</text>
    <text x="110" y="109" textAnchor="middle" fill={colors.textTertiary} fontSize="10">Velocity (dynamics)</text>

    {/* Arrow down */}
    <line x1="110" y1="130" x2="110" y2="160" stroke={colors.textTertiary} strokeWidth="2" markerEnd="url(#arrow2)" />

    {/* Ableton Track */}
    <rect x="20" y="170" width="180" height="90" fill={colors.bgCard} stroke={colors.accent1} strokeWidth="2" />
    <text x="110" y="195" textAnchor="middle" fill={colors.text} fontSize="13" fontWeight="600">Ableton Track</text>
    <text x="110" y="215" textAnchor="middle" fill={colors.textTertiary} fontSize="10">Instrument (Wavetable, etc.)</text>
    <text x="110" y="232" textAnchor="middle" fill={colors.textTertiary} fontSize="10">Effects Chain</text>
    <text x="110" y="249" textAnchor="middle" fill={colors.textTertiary} fontSize="10">MIDI Learn CC Mapping</text>

    {/* Use cases */}
    <rect x="260" y="20" width="320" height="240" fill={colors.bgCard} stroke={colors.border} strokeWidth="1" />
    <text x="420" y="45" textAnchor="middle" fill={colors.text} fontSize="13" fontWeight="600">Example Mappings</text>

    <text x="280" y="75" fill={colors.accent4} fontSize="11" fontWeight="500">Hand Y Position</text>
    <text x="280" y="92" fill={colors.textTertiary} fontSize="10">Filter cutoff via CC #74</text>

    <text x="280" y="120" fill={colors.accent4} fontSize="11" fontWeight="500">Hand X Position</text>
    <text x="280" y="137" fill={colors.textTertiary} fontSize="10">Pan or stereo width via CC #10</text>

    <text x="280" y="165" fill={colors.accent4} fontSize="11" fontWeight="500">Pinch Gesture</text>
    <text x="280" y="182" fill={colors.textTertiary} fontSize="10">Note trigger with velocity</text>

    <text x="280" y="210" fill={colors.accent4} fontSize="11" fontWeight="500">Mouth Open</text>
    <text x="280" y="227" fill={colors.textTertiary} fontSize="10">Reverb wet/dry via CC #91</text>

    <text x="280" y="255" fill={colors.accent4} fontSize="11" fontWeight="500">Arm Spread</text>
    <text x="280" y="272" fill={colors.textTertiary} fontSize="10">Volume/expression via CC #11</text>
  </svg>
);

const FuturePlansSlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>Future Plans: MIDI Integration</h2>
      <p style={styles.slideSubtitle}>Professional DAW integration for studio and live performance workflows</p>
    </div>

    <div style={styles.grid2}>
      <div>
        <div style={styles.sectionTitle}>MIDI Output Pipeline</div>
        <div style={styles.diagramContainer}>
          <MidiIntegrationDiagram />
        </div>

        <div style={{ ...styles.card, marginTop: '24px' }}>
          <div style={styles.cardTitle}>Web MIDI API</div>
          <div style={styles.cardText}>
            The Web MIDI API enables direct communication with MIDI devices and virtual ports
            from the browser. Combined with loopMIDI (Windows) or IAC Driver (macOS),
            ADMI can send MIDI data to any DAW running on the same machine.
          </div>
        </div>
      </div>

      <div>
        <div style={styles.sectionTitle}>DAW Integration Example</div>
        <div style={styles.diagramContainer}>
          <AbletonWorkflowDiagram />
        </div>
      </div>
    </div>

    <div style={{ ...styles.grid3, marginTop: '32px' }}>
      <div style={styles.card}>
        <div style={{ ...styles.cardTitle, color: colors.accent1 }}>MIDI Notes</div>
        <div style={styles.cardText}>
          Body position maps to MIDI notes. Y-axis controls pitch, gestures trigger note-on events,
          and movement velocity maps to MIDI velocity for dynamic expression.
        </div>
      </div>
      <div style={styles.card}>
        <div style={{ ...styles.cardTitle, color: colors.accent2 }}>Control Change</div>
        <div style={styles.cardText}>
          Continuous body movements output as CC messages. Use MIDI Learn in your DAW to map
          any tracked point to any synthesizer parameter or effect control.
        </div>
      </div>
      <div style={styles.card}>
        <div style={{ ...styles.cardTitle, color: colors.accent3 }}>Multi-Channel</div>
        <div style={styles.cardText}>
          Different body parts can output to different MIDI channels, enabling simultaneous
          control of multiple instruments or tracks in your session.
        </div>
      </div>
    </div>
  </div>
);

const SummarySlide = () => (
  <div>
    <div style={styles.slideHeader}>
      <h2 style={styles.slideTitle}>Summary</h2>
      <p style={styles.slideSubtitle}>Key contributions and future directions</p>
    </div>

    <div style={styles.grid2}>
      <div>
        <div style={styles.sectionTitle}>Key Features</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            'Real-time body tracking with 553 landmarks across 4 modalities',
            'Flexible parameter mapping from body position to sound',
            'Spatial trigger zones for sample-based performance',
            'Gesture detection for discrete musical events',
            'Accessibility-focused input profiles',
            'Browser-based with no installation required',
            'MIDI output for external instrument integration',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                width: '6px',
                height: '6px',
                background: colors.primary,
                marginTop: '6px',
                flexShrink: 0
              }} />
              <div style={styles.cardText}>{item}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={styles.sectionTitle}>Applications</div>
        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={styles.cardTitle}>Music Therapy</div>
          <div style={styles.cardText}>
            Adaptive interfaces for motor rehabilitation and therapeutic music-making.
          </div>
        </div>
        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={styles.cardTitle}>Live Performance</div>
          <div style={styles.cardText}>
            Embodied control of electronic music with full-body expression.
          </div>
        </div>
        <div style={{ ...styles.card, marginBottom: '16px' }}>
          <div style={styles.cardTitle}>Music Education</div>
          <div style={styles.cardText}>
            Engaging introduction to music concepts through movement.
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Accessible Music Creation</div>
          <div style={styles.cardText}>
            Alternative input methods for musicians with diverse abilities.
          </div>
        </div>
      </div>
    </div>

    <div style={{
      marginTop: '32px',
      padding: '24px',
      background: colors.bgCard,
      border: `1px solid ${colors.primary}`,
      textAlign: 'center'
    }}>
      <div style={{ color: colors.text, fontSize: '16px', fontWeight: 500 }}>
        Open source implementation available for research and development
      </div>
    </div>
  </div>
);

// Large diagrams for At a Glance poster slide
const PosterBodyDiagram = () => (
  <svg width="180" height="220" viewBox="0 0 180 220">
    {/* Head with face detail */}
    <ellipse cx="90" cy="35" rx="22" ry="28" fill="none" stroke={colors.accent1} strokeWidth="2.5" />
    <circle cx="80" cy="28" r="3" fill={colors.accent1} />
    <circle cx="100" cy="28" r="3" fill={colors.accent1} />
    <ellipse cx="90" cy="42" rx="8" ry="5" fill="none" stroke={colors.accent1} strokeWidth="1" />
    <text x="130" y="35" fill={colors.accent1} fontSize="11" fontWeight="600">Face</text>
    <text x="130" y="48" fill={colors.textTertiary} fontSize="9">478 pts</text>

    {/* Neck and torso */}
    <line x1="90" y1="63" x2="90" y2="90" stroke={colors.accent2} strokeWidth="2.5" />
    <line x1="50" y1="90" x2="130" y2="90" stroke={colors.accent2} strokeWidth="2.5" />
    <circle cx="50" cy="90" r="6" fill={colors.accent2} />
    <circle cx="130" cy="90" r="6" fill={colors.accent2} />
    <line x1="90" y1="90" x2="90" y2="140" stroke={colors.accent2} strokeWidth="2.5" />

    {/* Arms */}
    <line x1="50" y1="90" x2="30" y2="130" stroke={colors.accent2} strokeWidth="2.5" />
    <line x1="30" y1="130" x2="15" y2="170" stroke={colors.accent2} strokeWidth="2.5" />
    <circle cx="30" cy="130" r="5" fill={colors.accent2} />
    <circle cx="15" cy="170" r="7" fill={colors.accent5} />

    <line x1="130" y1="90" x2="150" y2="130" stroke={colors.accent2} strokeWidth="2.5" />
    <line x1="150" y1="130" x2="165" y2="170" stroke={colors.accent2} strokeWidth="2.5" />
    <circle cx="150" cy="130" r="5" fill={colors.accent2} />
    <circle cx="165" cy="170" r="7" fill={colors.accent4} />

    {/* Hand boxes */}
    <rect x="0" y="175" width="35" height="30" fill="none" stroke={colors.accent5} strokeWidth="1.5" strokeDasharray="4 2" />
    <text x="5" y="190" fill={colors.accent5} fontSize="9" fontWeight="500">L Hand</text>
    <text x="5" y="200" fill={colors.textTertiary} fontSize="8">21 pts</text>

    <rect x="145" y="175" width="35" height="30" fill="none" stroke={colors.accent4} strokeWidth="1.5" strokeDasharray="4 2" />
    <text x="150" y="190" fill={colors.accent4} fontSize="9" fontWeight="500">R Hand</text>
    <text x="150" y="200" fill={colors.textTertiary} fontSize="8">21 pts</text>

    {/* Hips and legs */}
    <line x1="70" y1="140" x2="110" y2="140" stroke={colors.accent2} strokeWidth="2.5" />
    <circle cx="70" cy="140" r="5" fill={colors.accent2} />
    <circle cx="110" cy="140" r="5" fill={colors.accent2} />

    <line x1="70" y1="140" x2="65" y2="180" stroke={colors.accent2} strokeWidth="2.5" />
    <line x1="65" y1="180" x2="60" y2="215" stroke={colors.accent2} strokeWidth="2.5" />
    <line x1="110" y1="140" x2="115" y2="180" stroke={colors.accent2} strokeWidth="2.5" />
    <line x1="115" y1="180" x2="120" y2="215" stroke={colors.accent2} strokeWidth="2.5" />

    {/* Pose label */}
    <text x="90" y="160" textAnchor="middle" fill={colors.accent2} fontSize="10" fontWeight="500">Pose: 33 pts</text>
  </svg>
);

const PosterZonesDiagram = () => (
  <svg width="240" height="160" viewBox="0 0 240 160">
    {/* Camera frame */}
    <rect x="5" y="5" width="230" height="150" fill={colors.bg} stroke={colors.borderLight} strokeWidth="2" />
    <text x="15" y="20" fill={colors.textTertiary} fontSize="9">Camera View</text>

    {/* Zones - 2x4 grid */}
    <rect x="15" y="30" width="50" height="50" fill="rgba(220, 38, 38, 0.2)" stroke={colors.accent5} strokeWidth="2" />
    <text x="40" y="58" textAnchor="middle" fill={colors.accent5} fontSize="10" fontWeight="600">Kick</text>

    <rect x="70" y="30" width="50" height="50" fill="rgba(37, 99, 235, 0.2)" stroke={colors.accent1} strokeWidth="2" />
    <text x="95" y="58" textAnchor="middle" fill={colors.accent1} fontSize="10" fontWeight="600">Snare</text>

    <rect x="125" y="30" width="50" height="50" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="2" />
    <text x="150" y="58" textAnchor="middle" fill="#f59e0b" fontSize="10" fontWeight="600">Hi-Hat</text>

    <rect x="180" y="30" width="50" height="50" fill="rgba(147, 51, 234, 0.2)" stroke={colors.accent3} strokeWidth="2" />
    <text x="205" y="58" textAnchor="middle" fill={colors.accent3} fontSize="10" fontWeight="600">Clap</text>

    <rect x="15" y="90" width="50" height="50" fill="rgba(22, 163, 74, 0.2)" stroke={colors.accent4} strokeWidth="2" />
    <text x="40" y="118" textAnchor="middle" fill={colors.accent4} fontSize="10" fontWeight="600">Bass</text>

    <rect x="70" y="90" width="50" height="50" fill="rgba(13, 148, 136, 0.2)" stroke={colors.accent2} strokeWidth="2" />
    <text x="95" y="118" textAnchor="middle" fill={colors.accent2} fontSize="10" fontWeight="600">Pad</text>

    {/* Person silhouette with hand entering zone */}
    <ellipse cx="175" cy="105" rx="12" ry="15" fill="none" stroke={colors.textTertiary} strokeWidth="1.5" />
    <line x1="175" y1="120" x2="175" y2="145" stroke={colors.textTertiary} strokeWidth="1.5" />
    <line x1="175" y1="125" x2="155" y2="110" stroke={colors.textTertiary} strokeWidth="1.5" />
    <line x1="175" y1="125" x2="205" y2="65" stroke={colors.textTertiary} strokeWidth="1.5" strokeDasharray="4 2" />
    <circle cx="205" cy="55" r="6" fill={colors.primary} />
  </svg>
);

const PosterPipelineDiagram = () => (
  <svg width="700" height="80" viewBox="0 0 700 80">
    {/* Pipeline boxes */}
    <rect x="0" y="15" width="120" height="50" fill={colors.bgCard} stroke={colors.accent1} strokeWidth="2" />
    <text x="60" y="45" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">Camera</text>

    <rect x="160" y="15" width="120" height="50" fill={colors.bgCard} stroke={colors.accent2} strokeWidth="2" />
    <text x="220" y="45" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">MediaPipe</text>

    <rect x="320" y="15" width="120" height="50" fill={colors.bgCard} stroke={colors.accent3} strokeWidth="2" />
    <text x="380" y="45" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">Processor</text>

    <rect x="480" y="15" width="100" height="50" fill={colors.bgCard} stroke={colors.primary} strokeWidth="2" />
    <text x="530" y="45" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">Mapping</text>

    <rect x="620" y="15" width="80" height="50" fill={colors.bgCard} stroke={colors.accent4} strokeWidth="2" />
    <text x="660" y="45" textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">Audio</text>

    {/* Arrows */}
    <polygon points="130,40 150,30 150,50" fill={colors.textTertiary} />
    <polygon points="290,40 310,30 310,50" fill={colors.textTertiary} />
    <polygon points="450,40 470,30 470,50" fill={colors.textTertiary} />
    <polygon points="590,40 610,30 610,50" fill={colors.textTertiary} />
  </svg>
);

const AtAGlanceSlide = () => (
  <div>
    {/* Hero header */}
    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
      <h1 style={{ fontSize: '48px', fontWeight: 800, color: colors.primary, margin: 0, letterSpacing: '-1px' }}>ADMI</h1>
      <p style={{ fontSize: '18px', color: colors.textSecondary, margin: '8px 0 0' }}>
        Accessible Digital Musical Instrument - Complete System Overview
      </p>
    </div>

    {/* Stats bar - prominent at top */}
    <div style={{
      display: 'flex',
      justifyContent: 'space-around',
      padding: '20px 32px',
      background: `linear-gradient(135deg, ${colors.bgCard} 0%, #e8e9eb 100%)`,
      border: `2px solid ${colors.primary}`,
      marginBottom: '24px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '42px', fontWeight: 800, color: colors.accent1 }}>553</div>
        <div style={{ fontSize: '12px', color: colors.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Tracked Points</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '42px', fontWeight: 800, color: colors.accent2 }}>4</div>
        <div style={{ fontSize: '12px', color: colors.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Modalities</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '42px', fontWeight: 800, color: colors.accent4 }}>30+</div>
        <div style={{ fontSize: '12px', color: colors.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>FPS</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '42px', fontWeight: 800, color: colors.primary }}>&lt;50ms</div>
        <div style={{ fontSize: '12px', color: colors.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Latency</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '42px', fontWeight: 800, color: colors.accent3 }}>0</div>
        <div style={{ fontSize: '12px', color: colors.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Install Required</div>
      </div>
    </div>

    {/* Pipeline */}
    <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
      <PosterPipelineDiagram />
    </div>

    {/* Main content - 3 columns */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '24px' }}>
      {/* Left column - Body tracking */}
      <div style={{ ...styles.card, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ ...styles.sectionTitle, marginTop: 0, fontSize: '14px', marginBottom: '16px' }}>Body Tracking</div>
        <PosterBodyDiagram />
        <div style={{ marginTop: '16px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ color: colors.accent1, fontWeight: 500 }}>Face Mesh</span>
            <span style={{ color: colors.textTertiary }}>478 landmarks</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ color: colors.accent2, fontWeight: 500 }}>Pose (BlazePose)</span>
            <span style={{ color: colors.textTertiary }}>33 landmarks</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ color: colors.accent5, fontWeight: 500 }}>Left Hand</span>
            <span style={{ color: colors.textTertiary }}>21 landmarks</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0' }}>
            <span style={{ color: colors.accent4, fontWeight: 500 }}>Right Hand</span>
            <span style={{ color: colors.textTertiary }}>21 landmarks</span>
          </div>
        </div>
      </div>

      {/* Center column - Zones */}
      <div style={{ ...styles.card, padding: '20px' }}>
        <div style={{ ...styles.sectionTitle, marginTop: 0, fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>Spatial Trigger Zones</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PosterZonesDiagram />
        </div>
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ background: colors.bg, padding: '12px', border: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: '11px', color: colors.primary, fontWeight: 600, marginBottom: '4px' }}>TRIGGER MODES</div>
            <div style={{ fontSize: '11px', color: colors.textSecondary }}>One-shot, Sustained, Toggle</div>
          </div>
          <div style={{ background: colors.bg, padding: '12px', border: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: '11px', color: colors.primary, fontWeight: 600, marginBottom: '4px' }}>SOUND OUTPUT</div>
            <div style={{ fontSize: '11px', color: colors.textSecondary }}>Samples, Synth, MIDI</div>
          </div>
        </div>
      </div>

      {/* Right column - Mappings, Gestures, Output */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Continuous Mappings */}
        <div style={{ ...styles.card, padding: '16px' }}>
          <div style={{ ...styles.sectionTitle, marginTop: 0, fontSize: '13px', marginBottom: '12px' }}>Continuous Mappings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <div style={{ width: '8px', height: '8px', background: colors.accent1 }} />
              <span style={{ flex: 1 }}>Y Position</span>
              <span style={{ color: colors.textTertiary }}>Pitch (C2-C6)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <div style={{ width: '8px', height: '8px', background: colors.accent2 }} />
              <span style={{ flex: 1 }}>X Position</span>
              <span style={{ color: colors.textTertiary }}>Pan / Filter</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <div style={{ width: '8px', height: '8px', background: colors.accent4 }} />
              <span style={{ flex: 1 }}>Movement Speed</span>
              <span style={{ color: colors.textTertiary }}>Volume / Intensity</span>
            </div>
          </div>
        </div>

        {/* Gesture Triggers */}
        <div style={{ ...styles.card, padding: '16px' }}>
          <div style={{ ...styles.sectionTitle, marginTop: 0, fontSize: '13px', marginBottom: '12px' }}>Gesture Triggers</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
            <div style={{ padding: '8px', background: colors.bg, border: `1px solid ${colors.border}` }}>
              <div style={{ fontWeight: 600, color: colors.text }}>Pinch</div>
              <div style={{ color: colors.textTertiary }}>Thumb + Index</div>
            </div>
            <div style={{ padding: '8px', background: colors.bg, border: `1px solid ${colors.border}` }}>
              <div style={{ fontWeight: 600, color: colors.text }}>Blink</div>
              <div style={{ color: colors.textTertiary }}>Eye Close</div>
            </div>
            <div style={{ padding: '8px', background: colors.bg, border: `1px solid ${colors.border}` }}>
              <div style={{ fontWeight: 600, color: colors.text }}>Brow Raise</div>
              <div style={{ color: colors.textTertiary }}>Eyebrow Up</div>
            </div>
            <div style={{ padding: '8px', background: colors.bg, border: `1px solid ${colors.border}` }}>
              <div style={{ fontWeight: 600, color: colors.text }}>Mouth Open</div>
              <div style={{ color: colors.textTertiary }}>Jaw Down</div>
            </div>
          </div>
        </div>

        {/* Output Options */}
        <div style={{ ...styles.card, padding: '16px' }}>
          <div style={{ ...styles.sectionTitle, marginTop: 0, fontSize: '13px', marginBottom: '12px' }}>Output Options</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '6px', height: '6px', background: colors.accent4, borderRadius: '50%' }} />
              <span style={{ fontWeight: 500 }}>Internal Synth</span>
              <span style={{ color: colors.textTertiary, marginLeft: 'auto' }}>Tone.js</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '6px', height: '6px', background: colors.accent1, borderRadius: '50%' }} />
              <span style={{ fontWeight: 500 }}>MIDI Output</span>
              <span style={{ color: colors.textTertiary, marginLeft: 'auto' }}>Web MIDI API</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '6px', height: '6px', background: colors.accent3, borderRadius: '50%' }} />
              <span style={{ fontWeight: 500 }}>Effects Chain</span>
              <span style={{ color: colors.textTertiary, marginLeft: 'auto' }}>Reverb, Delay, Filter</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Footer - Tech & Accessibility */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '20px' }}>
      <div style={{ background: colors.bgCard, padding: '16px', border: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: '12px', color: colors.primary, fontWeight: 600, marginBottom: '8px' }}>TECHNOLOGY</div>
        <div style={{ fontSize: '11px', color: colors.textSecondary, lineHeight: 1.6 }}>
          React 18, TypeScript, MediaPipe Vision, Tone.js, Web Audio API, Web MIDI
        </div>
      </div>
      <div style={{ background: colors.bgCard, padding: '16px', border: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: '12px', color: colors.primary, fontWeight: 600, marginBottom: '8px' }}>ACCESSIBILITY</div>
        <div style={{ fontSize: '11px', color: colors.textSecondary, lineHeight: 1.6 }}>
          Full Body, Hands Only, Face Only modes. Adjustable sensitivity, velocity thresholds, and dwell triggers.
        </div>
      </div>
      <div style={{ background: colors.bgCard, padding: '16px', border: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: '12px', color: colors.primary, fontWeight: 600, marginBottom: '8px' }}>PLATFORM</div>
        <div style={{ fontSize: '11px', color: colors.textSecondary, lineHeight: 1.6 }}>
          Browser-based (Chrome, Edge, Firefox). No installation. Cross-platform. Open source.
        </div>
      </div>
    </div>
  </div>
);

const slides: Slide[] = [
  { id: 'title', title: 'Overview', content: <TitleSlide /> },
  { id: 'architecture', title: 'Architecture', content: <ArchitectureSlide /> },
  { id: 'tracking', title: 'Tracking', content: <TrackingSlide /> },
  { id: 'mapping', title: 'Mapping', content: <MappingSlide /> },
  { id: 'zones', title: 'Zones', content: <ZonesSlide /> },
  { id: 'accessibility', title: 'Accessibility', content: <AccessibilitySlide /> },
  { id: 'technical', title: 'Technical', content: <TechnicalSlide /> },
  { id: 'future', title: 'MIDI/DAW', content: <FuturePlansSlide /> },
  { id: 'summary', title: 'Summary', content: <SummarySlide /> },
  { id: 'glance', title: 'At a Glance', content: <AtAGlanceSlide /> },
];

function InfoScreen() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      goToSlide(currentSlide + 1);
    } else if (e.key === 'ArrowLeft') {
      goToSlide(currentSlide - 1);
    } else if (e.key === 'Escape') {
      setCurrentScreen('welcome');
    }
  };

  return (
    <div style={styles.container} onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>ADMI Technical Documentation</div>
        <nav style={styles.nav}>
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              style={{
                ...styles.navBtn,
                ...(currentSlide === index ? styles.navBtnActive : {}),
              }}
              onClick={() => setCurrentSlide(index)}
            >
              {slide.title}
            </button>
          ))}
        </nav>
        <button style={styles.closeBtn} onClick={() => setCurrentScreen('welcome')}>
          Close
        </button>
      </header>

      {/* Slide Content */}
      <div style={styles.slideContainer}>
        <div style={styles.slide}>
          {slides[currentSlide].content}
        </div>
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <button
          style={{
            ...styles.arrowBtn,
            ...(currentSlide === 0 ? styles.arrowBtnDisabled : {}),
          }}
          onClick={() => goToSlide(currentSlide - 1)}
          disabled={currentSlide === 0}
        >
          Previous
        </button>

        <div style={styles.pageIndicator}>
          <span style={styles.pageText}>
            {currentSlide + 1} / {slides.length}
          </span>
          {slides.map((_, index) => (
            <div
              key={index}
              style={{
                ...styles.dot,
                ...(currentSlide === index ? styles.dotActive : {}),
              }}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>

        <button
          style={{
            ...styles.arrowBtn,
            ...(currentSlide === slides.length - 1 ? styles.arrowBtnDisabled : {}),
          }}
          onClick={() => goToSlide(currentSlide + 1)}
          disabled={currentSlide === slides.length - 1}
        >
          Next
        </button>
      </footer>
    </div>
  );
}

export default InfoScreen;
