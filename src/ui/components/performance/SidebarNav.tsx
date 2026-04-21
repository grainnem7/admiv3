/**
 * SidebarNav — Redesigned
 *
 * Visually rich sidebar with clear tier grouping,
 * active indicator animation, and generous spacing.
 */

import { useAppStore, useSidebarTier2Open, useSidebarTier3Open } from '../../../state/store';
import {
  IconHome, IconChevronRight, IconChevronLeft,
} from '../../design-system/Icons';
import {
  TIER_1_ITEMS, TIER_2_ITEMS, TIER_3_ITEMS,
  type SidebarSection, type SidebarItem,
} from './sidebarConfig';

interface SidebarNavProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}

function NavItem({
  item, isActive, collapsed, onClick,
}: {
  item: SidebarItem; isActive: boolean; collapsed: boolean; onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : item.description}
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: collapsed ? '12px 0' : '12px 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        minHeight: 44,
        background: isActive ? 'var(--color-primary-muted)' : 'transparent',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        fontSize: 14, fontWeight: isActive ? 600 : 500,
        transition: 'all 120ms ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = isActive ? '#f97316' : '#d0d0de'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(249,115,22,0.10)' : 'transparent'; e.currentTarget.style.color = isActive ? '#f97316' : '#9898a8'; }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div style={{
          position: 'absolute', left: 0, top: 6, bottom: 6,
          width: 3, borderRadius: 2,
          background: '#f97316',
        }} />
      )}
      <Icon size={18} />
      {!collapsed && <span>{item.label}</span>}
    </button>
  );
}

export default function SidebarNav({
  activeSection, onSectionChange, collapsed, onToggleCollapse,
}: SidebarNavProps) {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const moreOpen = useSidebarTier2Open();
  const setMoreOpen = useAppStore((s) => s.setSidebarTier2Open);
  const advOpen = useSidebarTier3Open();
  const setAdvOpen = useAppStore((s) => s.setSidebarTier3Open);

  const renderItems = (items: SidebarItem[]) =>
    items.map((item) => (
      <NavItem
        key={item.id} item={item}
        isActive={activeSection === item.id}
        collapsed={collapsed}
        onClick={() => onSectionChange(item.id)}
      />
    ));

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: collapsed ? 56 : 220,
      display: 'flex', flexDirection: 'column',
      background: '#0e0e14',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      zIndex: 200,
      transition: 'width 150ms ease',
      overflow: 'hidden',
    }} role="navigation" aria-label="Performance controls">

      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 52, padding: collapsed ? '0 16px' : '0 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#fff',
        }}>A</div>
        {!collapsed && (
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e4e4ef', letterSpacing: '-0.02em' }}>
            ADMIv3
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, padding: '12px 8px',
        overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {/* Home */}
        <button
          onClick={() => setCurrentScreen('welcome')}
          title={collapsed ? 'Home' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: collapsed ? '10px 0' : '10px 14px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'transparent', border: 'none', borderRadius: 8,
            cursor: 'pointer', color: '#71718a', fontSize: 14, fontWeight: 500,
            transition: 'all 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#d0d0de'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#71718a'; }}
        >
          <IconHome size={18} />
          {!collapsed && <span>Home</span>}
        </button>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

        {/* Tier 1 — Essentials */}
        {!collapsed && (
          <div style={{
            padding: '4px 14px 6px', fontSize: 10, fontWeight: 700,
            color: '#4a4a5a', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Essentials
          </div>
        )}
        {renderItems(TIER_1_ITEMS)}

        {/* Tier 2 — More */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 0' }} />
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: collapsed ? '10px 0' : '10px 14px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            minHeight: 36,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          {!collapsed && 'More'}
          <span style={{
            transition: 'transform 150ms ease',
            transform: moreOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          }}><IconChevronRight size={10} /></span>
        </button>
        {moreOpen && renderItems(TIER_2_ITEMS)}

        {/* Tier 3 — Advanced */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 0' }} />
        <button
          onClick={() => setAdvOpen(!advOpen)}
          aria-expanded={advOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: collapsed ? '10px 0' : '10px 14px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            minHeight: 36,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          {!collapsed && 'Advanced'}
          <span style={{
            transition: 'transform 150ms ease',
            transform: advOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          }}><IconChevronRight size={10} /></span>
        </button>
        {advOpen && renderItems(TIER_3_ITEMS)}
      </nav>

      {/* Collapse toggle */}
      <div style={{
        padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: 32, borderRadius: 6,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            color: '#71718a', cursor: 'pointer',
            transition: 'all 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#a1a1b8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#71718a'; }}
        >
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
