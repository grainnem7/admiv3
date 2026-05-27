# Remix drum-kit samples

The Remix percussion layer (`src/remix/layers/DrumKit.ts`) loads one-shot WAVs from
`public/samples/drums/<kitId>/`. The default kit id is `default`, expecting exactly:

- `kick.wav`
- `snare.wav`
- `hat.wav`
- `crash.wav`

These must be **single drum hits** (one-shots), NOT loops.

## Current local kit (not committed)
The four canonical files in `default/` are currently mapped from an "8R8" one-shot
kit the user added locally:

| canonical | source one-shot |
|---|---|
| `kick.wav`  | `BD_8R8_Chroma11.wav` |
| `snare.wav` | `SD_8R8_Chroma11.wav` |
| `hat.wav`   | `HH_8R8_Chroma.wav` (closed hat) |
| `crash.wav` | `Cym_8R8_ChromaST2.wav` |

Swap any of these for a different one-shot if you prefer the sound — just keep the
four canonical filenames.

## Not committed — licensing
The audio binaries in this folder are **git-ignored** (see `.gitignore`). Many "free"
sample sets (e.g. LANDR free samples) are royalty-free for use in productions but are
**not licensed for redistribution** in a public source repo, and the full set is large
(~130 MB). So the WAVs stay local.

- **Local dev:** works as-is (the files are on disk; Vite serves `public/`).
- **Deployment:** the percussion drums will be silent in a deployed build unless the
  samples are included there too — which requires a kit whose licence permits
  redistribution (a CC0 one-shot kit is the clean choice for shipping).

## Drum LOOPS (loop-layer feature)
The tempo-synced **loop layer** (`src/remix/layers/LoopLayer.ts`) brings one of a
curated set of drum loops in and out under the song via the loop baton, each
pitch-preservingly time-stretched to the song BPM.

- The loop WAVs live in `loops/` (a sibling of `default/`) and stay **git-ignored**.
- The curated set is listed in `loops/loops.json` (committed): one `{ "file", "name" }`
  entry per loop. The layer fetches this manifest at song load.
- Each loop's **filename must contain its source BPM** (e.g. `Dub Drums_97bpm.wav`,
  `Ed HiHat1 Loop_130 BPM.wav`). BPM is parsed from the filename; a loop whose name
  has no parseable BPM is dropped.
- **Curate loops whose BPM is close to the song's tempo.** `GrainPlayer` granular
  time-stretch smears drum transients when the stretch ratio is far from 1. The songs
  in `SONG_LIBRARY` sit around 96 BPM (range 67–158), so the current set is clustered
  at 94–100 BPM. The longer `*_bpm.wav` files still in `default/` are the source pool
  to pick from.
- **Current local set** (copied from `default/`, not committed):
  `Run Down drums_94bpm.wav` (Run Down), `Dub Drums_97bpm.wav` (Dub),
  `Shroom LANDR Break09_100bpm.wav` (Break), `Feel_me_more_100bpm.wav` (Feel Me).
- Same licensing/deployment caveat as the one-shots: a deployed build needs a
  redistributable (CC0) loop set placed in `loops/`.
