/**
 * Sidebar Component
 *
 * Main navigation sidebar with collapsible sections.
 */

import { useState } from 'react';
import {
  IconHome,
  IconBody,
  IconCalibrate,
  IconPreset,
  IconMonitor,
  IconSettings,
  IconMusic,
  IconChevronLeft,
  IconChevronRight,
} from './Icons';

export type SidebarSection = 'home' | 'input' | 'mapping' | 'calibration' | 'presets' | 'monitor' | 'settings';

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

interface NavItem {
  id: SidebarSection;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  group?: string;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: IconHome },
  { id: 'input', label: 'Input', icon: IconBody, group: 'Controls' },
  { id: 'mapping', label: 'Mapping', icon: IconMusic, group: 'Controls' },
  { id: 'calibration', label: 'Calibration', icon: IconCalibrate, group: 'Controls' },
  { id: 'presets', label: 'Presets', icon: IconPreset, group: 'Library' },
  { id: 'monitor', label: 'Monitor', icon: IconMonitor, group: 'Tools' },
  { id: 'settings', label: 'Settings', icon: IconSettings, group: 'Tools' },
];

export function Sidebar({
  activeSection,
  onSectionChange,
  isCollapsed = false,
  onCollapsedChange,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(isCollapsed);

  const handleCollapse = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onCollapsedChange?.(newCollapsed);
  };

  // Group items by their group property
  const groups = navItems.reduce((acc, item) => {
    const group = item.group || 'Main';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidebar__brand">
        <div className="sidebar__logo">A</div>
        <span className="sidebar__title">ADMIv3</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav" aria-label="Main navigation">
        {Object.entries(groups).map(([groupName, items]) => (
          <div key={groupName} className="sidebar__section">
            {groupName !== 'Main' && (
              <div className="sidebar__section-title">{groupName}</div>
            )}
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                  onClick={() => onSectionChange(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} />
                  <span className="sidebar__item-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer with collapse button */}
      <div className="sidebar__footer">
        <button
          className="sidebar__collapse-btn"
          onClick={handleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
