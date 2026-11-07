import { useState } from 'react';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';
import type { BoardPlayerProfile } from '../../../profiles/BoardProfiles';

export interface PlayerChooserProps {
  players: BoardPlayerProfile[];
  onPick(id: string): void;
  onCreate(name: string, handedness: 'left' | 'right'): void;
  /** A player's name or main hand changed. */
  onEdit(id: string, name: string, handedness: 'left' | 'right'): void;
  /** Shown when the chooser was opened from the header rather than at start-up. */
  onCancel?(): void;
  /** Open the ready-made demo piece (as its own player, with the last player's colours, cap and iPad). */
  onDemo?(): void;
}

/**
 * Who's playing? A profile carries someone's handedness, grid and sounds, so picking the
 * wrong one quietly changes the instrument under them. Names are personal data, so the
 * hint suggests initials or a code rather than a full name.
 */
export function PlayerChooser({ players, onPick, onCreate, onEdit, onCancel, onDemo }: PlayerChooserProps): JSX.Element {
  const [creating, setCreating] = useState(players.length === 0);
  // The player being edited, or null.
  const [editing, setEditing] = useState<BoardPlayerProfile | null>(null);

  return (
    <section
      aria-label="Who's playing?"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24, maxWidth: 680, margin: '0 auto' }}
    >
      <h2 style={{ margin: 0, fontSize: 24 }}>Who&apos;s playing?</h2>

      {!creating && !editing && (
        <>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
            {players.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                    minWidth: 180, minHeight: 96, padding: 16, textAlign: 'left',
                    borderRadius: 'var(--bs-radius-lg)', background: 'var(--bs-raised)',
                  }}
                >
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: 'var(--bs-fg2)', fontSize: 14 }}>
                    {p.settings.handedness === 'left' ? 'Left-handed' : 'Right-handed'}
                  </span>
                </button>
                <Button tone="quiet" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}: name and hand`}>Edit</Button>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button tone="primary" onClick={() => setCreating(true)}>New player</Button>
            {onCancel && <Button tone="quiet" onClick={onCancel}>Cancel</Button>}
          </div>
          {onDemo && players.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <Button tone="secondary" onClick={onDemo}>▶ Open the demo piece</Button>
              <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
                Rising Light: a ready-made piece of seven minutes. Soft drums, brass and a guitar, then
                grooves, a drop and a climb to a big finish. It plays the same every time, and uses your
                colours, cap and iPad, as one soft pad on their own track.
              </span>
            </div>
          )}
        </>
      )}

      {creating && (
        <PlayerForm
          submitLabel="Create"
          onSubmit={onCreate}
          onBack={players.length > 0 ? () => setCreating(false) : undefined}
        />
      )}
      {editing && (
        <PlayerForm
          key={editing.id}
          initialName={editing.name}
          initialHand={editing.settings.handedness === 'left' ? 'left' : 'right'}
          submitLabel="Save"
          onSubmit={(name, hand) => { onEdit(editing.id, name, hand); setEditing(null); }}
          onBack={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/** A player's name and main hand: for a new player, or to change one. */
function PlayerForm({ initialName = '', initialHand = 'right', submitLabel, onSubmit, onBack }: {
  initialName?: string;
  initialHand?: 'left' | 'right';
  submitLabel: string;
  onSubmit(name: string, handedness: 'left' | 'right'): void;
  onBack?(): void;
}): JSX.Element {
  const [name, setName] = useState(initialName);
  const [handedness, setHandedness] = useState<'left' | 'right'>(initialHand);
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={(e) => { e.preventDefault(); onSubmit(name, handedness); }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={{ minHeight: 'var(--bs-target)', padding: '0 10px' }}
        />
        <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
          Initials or a code are fine — this is stored on this computer.
        </span>
      </label>
      <div>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Which hand do they use most?</span>
        <SegmentedControl<'left' | 'right'>
          label="Which hand do they use most?"
          value={handedness}
          onChange={setHandedness}
          options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
        />
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--bs-fg2)' }}>
          Controls move to that side. The board, the camera and the music never mirror.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button tone="primary" type="submit">{submitLabel}</Button>
        {onBack && <Button tone="quiet" onClick={onBack}>Back</Button>}
      </div>
    </form>
  );
}
