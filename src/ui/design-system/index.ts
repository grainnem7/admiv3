/**
 * ADMIv3 Design System
 *
 * Export all design system components.
 */

// Import the CSS (this ensures it's bundled)
import './index.css';

// Icons
export * from './Icons';

// Layout components
export { Sidebar, type SidebarSection } from './Sidebar';
export { Panel, PanelSection, PanelRow } from './Panel';

// Status indicators
export {
  Badge,
  StatusDot,
  Meter,
  SegmentedMeter,
  TrackingStatus,
  StatusBarItem,
  Spinner,
} from './StatusIndicators';
