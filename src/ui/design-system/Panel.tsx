/**
 * Panel Component
 *
 * Collapsible panel with header and content.
 * Used for control sections in the DAW-like layout.
 */

import { useState, type ReactNode } from 'react';
import { IconChevronRight } from './Icons';

interface PanelProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  elevated?: boolean;
  headerAction?: ReactNode;
  className?: string;
}

export function Panel({
  title,
  children,
  defaultExpanded = true,
  collapsible = true,
  elevated = false,
  headerAction,
  className = '',
}: PanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div
      className={`panel ${elevated ? 'panel--elevated' : ''} ${collapsible ? 'panel--collapsible' : ''} ${isExpanded ? 'panel--expanded' : ''} ${className}`}
    >
      <div
        className="panel__header"
        onClick={collapsible ? handleToggle : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        } : undefined}
        aria-expanded={collapsible ? isExpanded : undefined}
      >
        <h3 className="panel__title">{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {headerAction}
          {collapsible && (
            <span className="panel__toggle-icon" aria-hidden="true">
              <IconChevronRight size={14} />
            </span>
          )}
        </div>
      </div>
      {(!collapsible || isExpanded) && (
        <div className="panel__content">
          {children}
        </div>
      )}
    </div>
  );
}

interface PanelSectionProps {
  children: ReactNode;
  className?: string;
}

export function PanelSection({ children, className = '' }: PanelSectionProps) {
  return (
    <div className={`panel__section ${className}`} style={{ marginBottom: 'var(--space-4)' }}>
      {children}
    </div>
  );
}

interface PanelRowProps {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
}

export function PanelRow({ label, value, children }: PanelRowProps) {
  return (
    <div className="data-row">
      <span className="data-row__label">{label}</span>
      {value !== undefined ? (
        <span className="data-row__value">{value}</span>
      ) : (
        children
      )}
    </div>
  );
}

export default Panel;
