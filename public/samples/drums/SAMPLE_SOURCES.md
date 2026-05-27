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

## Drum LOOPS (for the future loop-layer feature)
The longer `*_bpm.wav` loop/break files in this folder are **not** used by the
percussion one-shot layer. They are staged for the upcoming tempo-synced **loop-layer**
feature (roadmap), which brings a tempo-matched drum loop in/out under the song. Same
licensing/redistribution caveat applies.
