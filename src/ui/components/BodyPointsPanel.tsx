/**
 * Body Points Panel - Redesigned with inline styles
 * Now includes an expandable modal view for better visibility
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { TrackedBodyPoint, PointMappingTarget } from '../../state/types';
import {
  type LandmarkSource,
  type LandmarkDefinition,
  getLandmarkGroups,
  getSourceDisplayName,
} from '../../state/landmarkDefinitions';

interface BodyPointsPanelProps {
  trackedPoints: TrackedBodyPoint[];
  onPointsChange: (points: TrackedBodyPoint[]) => void;
  /** When true, parent panel is expanded so use larger layout */
  parentExpanded?: boolean;
}

type TabId = 'pose' | 'leftHand' | 'rightHand' | 'face';

const TABS: { id: TabId; label: string }[] = [
  { id: 'pose', label: 'Body' },
  { id: 'leftHand', label: 'L Hand' },
  { id: 'rightHand', label: 'R Hand' },
  { id: 'face', label: 'Face' },
];

const MAPPING_OPTIONS: { value: PointMappingTarget; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'volume', label: 'Volume' },
  { value: 'filter', label: 'Filter' },
  { value: 'zone-trigger', label: 'Zone' },
];

// Inline styles
const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  expandBtn: {
    padding: '8px 16px',
    background: '#f97316',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '8px',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalContent: {
    background: '#1a1a1a',
    border: '2px solid #f97316',
    width: '90%',
    maxWidth: '900px',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: '24px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid #333',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
  },
  closeBtn: {
    padding: '8px 16px',
    background: '#333',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
  },
  modalBody: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  tabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0',
    background: '#1a1a1a',
  },
  tab: {
    padding: '10px 8px',
    background: '#252525',
    border: '1px solid #333',
    borderRight: 'none',
    color: '#888',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabLast: {
    borderRight: '1px solid #333',
  },
  tabActive: {
    background: '#f97316',
    borderColor: '#f97316',
    color: '#fff',
  },
  selector: {
    background: '#1a1a1a',
    border: '1px solid #333',
    padding: '12px',
    maxHeight: '250px',
    overflowY: 'auto' as const,
  },
  groupName: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#f97316',
    textTransform: 'uppercase' as const,
    marginBottom: '8px',
    marginTop: '12px',
  },
  groupNameFirst: {
    marginTop: '0',
  },
  landmarkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '4px',
  },
  landmarkGridExpanded: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '6px',
  },
  landmark: {
    padding: '6px 4px',
    background: '#252525',
    border: '1px solid #333',
    color: '#ccc',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  landmarkExpanded: {
    padding: '10px 8px',
    background: '#252525',
    border: '1px solid #333',
    color: '#ccc',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  landmarkActive: {
    background: '#f97316',
    borderColor: '#f97316',
    color: '#fff',
  },
  activeSection: {
    background: '#1a1a1a',
    border: '1px solid #333',
    padding: '12px',
  },
  activeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '8px',
  },
  activeDot: {
    width: '8px',
    height: '8px',
    background: '#22c55e',
    borderRadius: '50%',
  },
  pointList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    maxHeight: '150px',
    overflowY: 'auto' as const,
  },
  point: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    background: '#202020',
    border: '1px solid #333',
    cursor: 'pointer',
  },
  pointSelected: {
    borderColor: '#f97316',
  },
  pointName: {
    flex: 1,
    fontSize: '12px',
    color: '#fff',
  },
  pointSource: {
    fontSize: '10px',
    color: '#666',
    background: '#333',
    padding: '2px 4px',
  },
  pointMapping: {
    fontSize: '10px',
    color: '#f97316',
    fontWeight: 500,
  },
  removeBtn: {
    padding: '2px 6px',
    background: 'transparent',
    border: '1px solid #444',
    color: '#666',
    fontSize: '14px',
    cursor: 'pointer',
  },
  config: {
    background: '#1a1a1a',
    border: '2px solid #f97316',
    padding: '12px',
  },
  configTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#f97316',
    marginBottom: '12px',
  },
  configRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  configLabel: {
    fontSize: '11px',
    color: '#888',
    width: '50px',
  },
  select: {
    flex: 1,
    padding: '6px 8px',
    background: '#252525',
    border: '1px solid #444',
    color: '#fff',
    fontSize: '12px',
  },
  axisBtn: {
    flex: 1,
    padding: '6px',
    background: '#252525',
    border: '1px solid #444',
    color: '#ccc',
    fontSize: '11px',
    cursor: 'pointer',
  },
  axisBtnActive: {
    background: '#f97316',
    borderColor: '#f97316',
    color: '#fff',
  },
  empty: {
    padding: '16px',
    textAlign: 'center' as const,
    color: '#666',
    fontSize: '12px',
  },
};

function BodyPointsPanel({ trackedPoints, onPointsChange, parentExpanded = false }: BodyPointsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('pose');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Use expanded layout when either in modal or parent panel is expanded
  const useExpandedLayout = parentExpanded;

  const isPointTracked = useCallback(
    (source: LandmarkSource, index: number) => {
      return trackedPoints.some(
        p => p.source === source && p.landmarkIndex === index && p.enabled
      );
    },
    [trackedPoints]
  );

  const getTrackedPoint = useCallback(
    (source: LandmarkSource, index: number) => {
      return trackedPoints.find(
        p => p.source === source && p.landmarkIndex === index
      );
    },
    [trackedPoints]
  );

  const toggleLandmark = useCallback(
    (source: LandmarkSource, landmark: LandmarkDefinition) => {
      const existing = getTrackedPoint(source, landmark.index);

      if (existing) {
        const updated = trackedPoints.map(p =>
          p.id === existing.id ? { ...p, enabled: !p.enabled } : p
        );
        onPointsChange(updated);
      } else {
        const newPoint: TrackedBodyPoint = {
          id: `${source}-${landmark.index}`,
          name: landmark.name,
          source,
          landmarkIndex: landmark.index,
          enabled: true,
          mapping: null,
        };
        onPointsChange([...trackedPoints, newPoint]);
      }
    },
    [trackedPoints, getTrackedPoint, onPointsChange]
  );

  const updatePointMapping = useCallback(
    (pointId: string, target: PointMappingTarget, axis?: 'x' | 'y', inverted?: boolean) => {
      const updated = trackedPoints.map(p => {
        if (p.id !== pointId) return p;
        return {
          ...p,
          mapping: target === 'none' ? null : {
            target,
            axis: axis || 'y',
            inverted: inverted || false,
          },
        };
      });
      onPointsChange(updated);
    },
    [trackedPoints, onPointsChange]
  );

  const removePoint = useCallback(
    (pointId: string) => {
      onPointsChange(trackedPoints.filter(p => p.id !== pointId));
      if (selectedPointId === pointId) {
        setSelectedPointId(null);
      }
    },
    [trackedPoints, onPointsChange, selectedPointId]
  );

  const groups = getLandmarkGroups(activeTab);
  const activePoints = trackedPoints.filter(p => p.enabled);
  const selectedPoint = selectedPointId ? trackedPoints.find(p => p.id === selectedPointId) : null;

  // All landmarks in current tab
  const allTabLandmarks = groups.flatMap(g => g.landmarks);
  const allTabSelected = allTabLandmarks.every(l => isPointTracked(activeTab, l.index));

  const selectAllInTab = useCallback(() => {
    const toAdd: TrackedBodyPoint[] = [];
    for (const landmark of allTabLandmarks) {
      const existing = getTrackedPoint(activeTab, landmark.index);
      if (!existing) {
        toAdd.push({
          id: `${activeTab}-${landmark.index}`,
          name: landmark.name,
          source: activeTab,
          landmarkIndex: landmark.index,
          enabled: true,
          mapping: null,
        });
      }
    }
    // Enable any existing-but-disabled points, plus add new ones
    const updated = trackedPoints.map(p =>
      p.source === activeTab && !p.enabled ? { ...p, enabled: true } : p
    );
    onPointsChange([...updated, ...toAdd]);
  }, [activeTab, allTabLandmarks, trackedPoints, getTrackedPoint, onPointsChange]);

  const deselectAllInTab = useCallback(() => {
    onPointsChange(trackedPoints.filter(p => !(p.source === activeTab && p.enabled)));
  }, [activeTab, trackedPoints, onPointsChange]);

  // Render the landmark selector (used in both compact and expanded views)
  const renderLandmarkSelector = (expanded: boolean) => (
    <div style={expanded ? { ...styles.selector, maxHeight: 'none', padding: '16px' } : styles.selector}>
      {/* Tabs */}
      <div style={{ ...styles.tabs, marginBottom: '16px' }}>
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(i === TABS.length - 1 ? styles.tabLast : {}),
              ...(activeTab === tab.id ? styles.tabActive : {}),
              ...(expanded ? { padding: '12px 16px', fontSize: '14px' } : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Select All / Deselect All */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        <button
          style={{
            flex: 1,
            padding: expanded ? '8px' : '6px',
            background: allTabSelected ? '#333' : '#f97316',
            border: 'none',
            color: '#fff',
            fontSize: expanded ? '12px' : '11px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onClick={selectAllInTab}
        >
          Select All
        </button>
        <button
          style={{
            flex: 1,
            padding: expanded ? '8px' : '6px',
            background: '#333',
            border: '1px solid #444',
            color: '#ccc',
            fontSize: expanded ? '12px' : '11px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onClick={deselectAllInTab}
        >
          Deselect All
        </button>
      </div>

      {groups.map((group, groupIndex) => (
        <div key={group.category}>
          <div style={{
            ...styles.groupName,
            ...(groupIndex === 0 ? styles.groupNameFirst : {}),
            ...(expanded ? { fontSize: '13px', marginBottom: '10px', marginTop: '16px' } : {}),
          }}>
            {group.name}
          </div>
          <div style={expanded ? styles.landmarkGridExpanded : styles.landmarkGrid}>
            {group.landmarks.map(landmark => {
              const isActive = isPointTracked(activeTab, landmark.index);
              return (
                <button
                  key={landmark.index}
                  style={{
                    ...(expanded ? styles.landmarkExpanded : styles.landmark),
                    ...(isActive ? styles.landmarkActive : {}),
                  }}
                  onClick={() => toggleLandmark(activeTab, landmark)}
                  title={landmark.name}
                >
                  {expanded ? landmark.name : landmark.shortName}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  // Render active points and configuration
  const renderActivePointsAndConfig = (expanded: boolean) => (
    <>
      {/* Active Points */}
      <div style={expanded ? { ...styles.activeSection, padding: '16px' } : styles.activeSection}>
        <div style={{ ...styles.activeHeader, ...(expanded ? { fontSize: '14px' } : {}) }}>
          <span style={styles.activeDot} />
          Active Points ({activePoints.length})
        </div>

        {activePoints.length === 0 ? (
          <div style={styles.empty}>
            Click landmarks {expanded ? 'on the left' : 'above'} to track them
          </div>
        ) : (
          <div style={{ ...styles.pointList, ...(expanded ? { maxHeight: '300px' } : {}) }}>
            {activePoints.map(point => (
              <div
                key={point.id}
                style={{
                  ...styles.point,
                  ...(selectedPointId === point.id ? styles.pointSelected : {}),
                }}
                onClick={() => setSelectedPointId(selectedPointId === point.id ? null : point.id)}
              >
                <span style={styles.pointName}>{point.name}</span>
                <span style={styles.pointSource}>{getSourceDisplayName(point.source)}</span>
                <span style={styles.pointMapping}>
                  {point.mapping ? point.mapping.target : '-'}
                </span>
                <button
                  style={styles.removeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    removePoint(point.id);
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration */}
      {selectedPoint && (
        <div style={expanded ? { ...styles.config, padding: '16px' } : styles.config}>
          <div style={{ ...styles.configTitle, ...(expanded ? { fontSize: '14px' } : {}) }}>
            Configure: {selectedPoint.name}
          </div>

          <div style={styles.configRow}>
            <span style={styles.configLabel}>Map to:</span>
            <select
              style={styles.select}
              value={selectedPoint.mapping?.target || 'none'}
              onChange={(e) => updatePointMapping(
                selectedPoint.id,
                e.target.value as PointMappingTarget,
                selectedPoint.mapping?.axis,
                selectedPoint.mapping?.inverted
              )}
            >
              {MAPPING_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {selectedPoint.mapping && selectedPoint.mapping.target !== 'none' && selectedPoint.mapping.target !== 'zone-trigger' && (
            <>
              <div style={styles.configRow}>
                <span style={styles.configLabel}>Axis:</span>
                <button
                  style={{
                    ...styles.axisBtn,
                    ...(selectedPoint.mapping.axis === 'x' ? styles.axisBtnActive : {}),
                  }}
                  onClick={() => updatePointMapping(
                    selectedPoint.id,
                    selectedPoint.mapping!.target,
                    'x',
                    selectedPoint.mapping?.inverted
                  )}
                >
                  X (horizontal)
                </button>
                <button
                  style={{
                    ...styles.axisBtn,
                    ...(selectedPoint.mapping.axis === 'y' ? styles.axisBtnActive : {}),
                  }}
                  onClick={() => updatePointMapping(
                    selectedPoint.id,
                    selectedPoint.mapping!.target,
                    'y',
                    selectedPoint.mapping?.inverted
                  )}
                >
                  Y (vertical)
                </button>
              </div>

              <div style={styles.configRow}>
                <span style={styles.configLabel}>Invert:</span>
                <button
                  style={{
                    ...styles.axisBtn,
                    ...(!selectedPoint.mapping.inverted ? styles.axisBtnActive : {}),
                  }}
                  onClick={() => updatePointMapping(
                    selectedPoint.id,
                    selectedPoint.mapping!.target,
                    selectedPoint.mapping?.axis,
                    false
                  )}
                >
                  Normal
                </button>
                <button
                  style={{
                    ...styles.axisBtn,
                    ...(selectedPoint.mapping.inverted ? styles.axisBtnActive : {}),
                  }}
                  onClick={() => updatePointMapping(
                    selectedPoint.id,
                    selectedPoint.mapping!.target,
                    selectedPoint.mapping?.axis,
                    true
                  )}
                >
                  Inverted
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );

  // Expanded modal view
  const renderModal = () => {
    if (!isExpanded) return null;

    return createPortal(
      <div style={styles.modalOverlay} onClick={() => setIsExpanded(false)}>
        <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <span style={styles.modalTitle}>Body Points Configuration</span>
            <button style={styles.closeBtn} onClick={() => setIsExpanded(false)}>
              Close
            </button>
          </div>
          <div style={styles.modalBody}>
            <div>
              <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px' }}>Select Landmarks</h3>
              {renderLandmarkSelector(true)}
            </div>
            <div>
              <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px' }}>Active Points & Configuration</h3>
              {renderActivePointsAndConfig(true)}
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div style={styles.panel}>
      {/* Expand Button - only show when parent is not expanded */}
      {!parentExpanded && (
        <button style={styles.expandBtn} onClick={() => setIsExpanded(true)}>
          Expand Panel
        </button>
      )}

      {/* Use expanded layout when parent panel is expanded */}
      {renderLandmarkSelector(useExpandedLayout)}
      {renderActivePointsAndConfig(useExpandedLayout)}

      {/* Expanded Modal - only needed when parent is not expanded */}
      {!parentExpanded && renderModal()}
    </div>
  );
}

export default BodyPointsPanel;
