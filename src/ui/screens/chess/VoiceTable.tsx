/** Each piece's sound, changeable, with a mute for each. */
import { useChessVoices } from '../../../songs/chess/chessVoiceStore';
import { PIECE_NAMES, PIECE_TYPES, SIDE_NAMES } from '../../../songs/chess/chessVoices';
import { soundOptionGroups, soundsFor, type SoundOption } from '../boardSequencer/soundCatalogue';

/** Every melodic sound in the catalogue, once, in its family. */
const ALL_SOUNDS: SoundOption[] = (() => {
  const seen = new Set<string>();
  const out: SoundOption[] = [];
  for (const o of [...soundsFor('melody'), ...soundsFor('chord'), ...soundsFor('bass')]) {
    if (seen.has(o.key) || seen.has(o.name)) continue;
    seen.add(o.key); seen.add(o.name);
    out.push(o);
  }
  const order = ['Keys', 'Strings', 'Wind and brass', 'Plucked and struck', 'Synth'];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
})();

export function VoiceTable() {
  const { sounds, muted, setSound, toggleMute, resetSounds } = useChessVoices();
  return (
    <div>
      <table style={{ borderCollapse: 'collapse', fontSize: 16 }}>
        <tbody>
          {(['w', 'b'] as const).flatMap((side) => PIECE_TYPES.map((p) => {
            const voice = side + p;
            const name = `${SIDE_NAMES[side]} ${PIECE_NAMES[p].toLowerCase()}`;
            const off = muted.has(voice);
            return (
              <tr key={voice} aria-label={name}>
                <th scope="row" style={{ textAlign: 'left', paddingRight: 8, fontWeight: 'normal' }}>{name}</th>
                <td>
                  <select aria-label={`Sound for ${name}`} value={sounds[voice]} style={{ minHeight: 44, fontSize: 16 }}
                    onChange={(e) => setSound(voice, e.target.value)}>
                    {soundOptionGroups(ALL_SOUNDS).map((g) => (
                      <optgroup key={g.group ?? ''} label={g.group ?? ''}>
                        {g.items.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="btn btn--ghost" aria-pressed={off} aria-label={`Mute ${name}`}
                    style={{ minHeight: 44, minWidth: 88, fontSize: 16 }} onClick={() => toggleMute(voice)}>
                    {off ? 'Muted' : 'Mute'}
                  </button>
                </td>
              </tr>
            );
          }))}
        </tbody>
      </table>
      <button className="btn btn--ghost" style={{ minHeight: 44, fontSize: 16, marginTop: 8 }} onClick={resetSounds}>Back to the usual sounds</button>
    </div>
  );
}
