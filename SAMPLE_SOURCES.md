# Sample Sources and Licences

This document records the source, licence, and quality status of every
instrument sample loaded by the ADMI audio engine.

The Workshop 5 directive (2026-05-06) was to replace synthesised pads
with **real instrument samples** for the baton instrument-mode palette.
Where a true sample-based option isn't yet bundled, the palette currently
uses the closest sampled real-instrument substitute and the gap is
documented below so it can be filled in before the next workshop.

## Curated instrument-mode palette

Defined in [`src/songs/voices/presets/instrumentPalette.ts`](src/songs/voices/presets/instrumentPalette.ts).
These are the five instruments the user can assign to a baton when the
baton is switched into instrument mode.

| Palette entry | Sample set used | Source | Licence | Status |
|---|---|---|---|---|
| Piano | `piano` (Salamander Grand V3) | <https://tonejs.github.io/audio/salamander/> | CC-BY 3.0 (Alexander Holm) | ✅ Real samples, multi-velocity, high quality |
| Electric Piano | `organ` (substitute) | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | ⚠️ Substitute — organ standing in for a true Rhodes/Wurlitzer EP. See gap below. |
| Upright Bass | `contrabass` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | ⚠️ CDN provides only A2; pitch-shifted across bass range, sounds rubbery at extremes. |
| Strings | `cello` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | ✅ Real samples, three octaves (A2/A3/A4). |
| Plucked Percussion | `guitarNylon` (substitute) | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | ⚠️ Substitute — nylon-guitar plucks standing in for a true congas / clean-kit sample set. See gap below. |

### Known sample gaps

These two palette entries are currently using their closest real-instrument
substitute. Sourcing the listed sample libraries and bundling them would
upgrade the palette to fully meet the participant's preference.

1. **Electric Piano** — needs a sampled Rhodes Mark I or Wurlitzer 200A.
   - Candidate: [Greg Sullivan Mk1 Electric Piano](https://github.com/sfzinstruments/GregSullivan.Mk1.sfz) (SFZ, free, multi-velocity)
   - Candidate: [Salamander DR-1 / Wurlitzer alternative](https://github.com/sfzinstruments) (various free SFZ packs)
   - Action: convert SFZ to a small Tone.Sampler URL map (3-5 velocity layers per octave) and host under `public/samples/electricPiano/`.

2. **Percussion** — needs a small sampled kit or hand-percussion set.
   - Candidate: [Sonatina Symphonic Orchestra percussion](http://sso.mattiaswestlund.net/) (CC-BY 3.0) — has shakers, woodblocks, congas.
   - Candidate: [FreePats GeneralMIDI percussion](https://freepats.zenvoid.org/) (CC0 / Public Domain) — small drum-kit samples.
   - Action: pick a tight 5-7 sample set (kick, snare, conga lo/hi, shaker, woodblock), host under `public/samples/percussion/`.

## Wider sample catalogue (used by parameter-mode voices)

Defined in [`src/songs/voices/SamplerPlayer.ts`](src/songs/voices/SamplerPlayer.ts)
under `SAMPLE_CONFIGS`. These are loaded by the existing parameter-mode
voices (ChordPadVoice, MelodicVoice, ArpeggioVoice, BassSynthVoice) and
were not changed by this work — listed here for completeness so the
overall licence picture is documented.

| Key | Source | Licence | Notes |
|---|---|---|---|
| `piano` | tonejs.github.io/audio/salamander/ | CC-BY 3.0 | Salamander Grand V3 — multi-velocity, high quality. |
| `violin` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | A3/A4/A5 sample set. |
| `cello` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | A2/A3/A4 sample set. |
| `contrabass` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | Only A2 reachable on CDN (A1/A3 404). |
| `clarinet` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | D3/D4/D5 (no A-notes available). |
| `frenchHorn` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | Only A3 reachable. |
| `tuba` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | Bb1/Bb2/D3. |
| `harp` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | Only A4 reachable. |
| `guitarNylon` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | A3/A4/A5. |
| `organ` | nbrosowsky/tonejs-instruments | CC-BY-SA 3.0 | A2/A3/A4. |

## CDN-dependence note

All samples are currently fetched from CDNs at runtime
(`tonejs.github.io/audio/salamander/` and `nbrosowsky.github.io/tonejs-instruments/`).
This keeps the repo small but means offline workshop demos depend on the
samples being cached. If reliable offline play is needed, the same files
can be mirrored under `public/samples/` and the `baseUrl` in
`SAMPLE_CONFIGS` switched to the local path.

## Adding a new sample

1. Decide if the sample lives on a CDN or under `public/samples/<instrument>/`.
2. Add an entry to `SAMPLE_CONFIGS` in `src/songs/voices/SamplerPlayer.ts`,
   matching the shape of existing entries (`urls`, `baseUrl`, `attack`,
   `release`).
3. If the sample is meant for the curated instrument-mode palette, add
   an `InstrumentPaletteEntry` in
   `src/songs/voices/presets/instrumentPalette.ts` referencing the new
   `SAMPLE_CONFIGS` key.
4. Append a row to the relevant table here, with source URL and licence.
