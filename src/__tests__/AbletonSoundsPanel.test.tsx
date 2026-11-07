import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { AbletonSoundsPanel } from '../ui/screens/boardSequencer/components/AbletonSoundsPanel';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function render(): void {
  act(() => root.render(
    <AbletonSoundsPanel config={{ ...DEFAULT_BOARD_SEQUENCER_CONFIG, midiEnabled: true }} getLive={() => null} onSend={vi.fn()} connected />,
  ));
}

const checklist = (): HTMLTableElement => {
  const t = [...host.querySelectorAll('table')].find((x) => x.querySelector('caption')?.textContent?.includes('named exactly'));
  if (!t) throw new Error('no checklist table');
  return t as HTMLTableElement;
};

describe('the Template checklist', () => {
  it('names all 33 sounds and which each track holds', () => {
    render();
    expect(host.textContent).toContain('Template checklist: the 33 sounds, and which each track holds');
    const t = checklist();
    expect([...t.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(
      ['Chain', 'Name', 'Zone (CC 30)', 'Melody', 'Chords', 'Bass', 'Band, Extra notes and Loops'],
    );
    const rows = [...t.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(33);
    const flute = [...rows[19].querySelectorAll('td')].map((td) => td.textContent);
    expect(flute.slice(0, 2)).toEqual(['20', 'Flute']);
    expect(flute.slice(3)).toEqual(['Real', 'Placeholder', 'Placeholder', 'Placeholder']);
  });

  it('with your counters on their own track, names the extra track to build; without, says nothing of it', () => {
    act(() => root.render(
      <AbletonSoundsPanel config={{ ...DEFAULT_BOARD_SEQUENCER_CONFIG, midiEnabled: true, playerTrack: 14 }} getLive={() => null} onSend={vi.fn()} connected />,
    ));
    expect(host.textContent).toContain('Your counters play on their own track: MIDI channel 14. Build one more track for them (the demo calls it “Tim’s glow”): MIDI From the port ADMIOutput, channel 14, Monitor In.');
    expect(host.textContent).toContain('an Instrument Rack of five chains, in this order: the soft glow pad, Piano, Flute, Trumpet, Sax');
    expect(host.textContent).toContain('Glow 0–24, Piano 25–50, Flute 51–76, Trumpet 77–101, Sax 102–127');
    render();
    expect(host.textContent).not.toContain('Your counters play on their own track');
  });

  it('starts with how to change from the 16-sound racks', () => {
    render();
    expect(host.textContent).toContain(
      'Changing from the 16-sound racks? On every track except the drums (channel 10): rename chains 11, 14, 15 and 16, add chains 17 to 33 with the placeholder, then drag chain 33’s zone out to end at 127, select every chain and choose Distribute Ranges Equally. Then check in the ruler that chains 4, 18 and 30 start at 9, 64 and 112.',
    );
    expect(host.textContent).toContain('Placeholder: an empty chain, or Operator with its default sound. Timbo never sends a track to a chain it does not hold. In One per colour mode the melody colours use tracks 1, 14 and 15: build three Melody tracks first. A fader per loop needs the Loop 1 to 6 tracks first.');
  });
});
