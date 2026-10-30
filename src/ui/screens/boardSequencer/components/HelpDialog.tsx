import { useLayoutEffect, useRef } from 'react';
import BoardHelp, { HELP_SECTION_TITLES, helpSectionId } from '../../../components/board/BoardHelp';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Help (A8). It opens at the top with focus on its heading; the list of sections and Close
 * stay put while the text scrolls on its own, so a keyboard or switch user is never left at
 * the end of 3,500 px with Close as the only thing to press.
 */
export default function HelpDialog({ onClose }: { onClose(): void }): JSX.Element {
  const heading = useRef<HTMLHeadingElement | null>(null);
  const text = useRef<HTMLDivElement | null>(null);
  // Before the dialog's own focus rule runs (it only steps in when focus is not inside).
  useLayoutEffect(() => {
    if (text.current) text.current.scrollTop = 0;
    heading.current?.focus();
  }, []);

  const goTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string): void => {
    // Stay on this page: the address does not change.
    e.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView?.({ block: 'start' });
    target.focus();
  };

  return (
    <Modal label="How to play" onClose={onClose} layout="free" maxWidth={920}>
      <div className="bs-help-head">
        <h2 ref={heading} tabIndex={-1} style={{ margin: 0, fontSize: 20, flex: 1 }}>How to play</h2>
        <Button tone="secondary" onClick={onClose}>Close</Button>
      </div>
      <div className="bs-help-body">
        <nav className="bs-help-nav" data-help-nav aria-label="Sections of Help">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {HELP_SECTION_TITLES.map((title, i) => (
              <li key={title}>
                <a href={`#${helpSectionId(i)}`} onClick={(e) => goTo(e, helpSectionId(i))}>{title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="bs-help-text" data-help-text ref={text} role="region" aria-label="How to play, the text" tabIndex={0}>
          <BoardHelp />
        </div>
      </div>
    </Modal>
  );
}
