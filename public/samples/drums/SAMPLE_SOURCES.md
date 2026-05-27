# Remix drum-kit samples

The Remix percussion layer (`src/remix/layers/DrumKit.ts`) loads one-shot WAVs from
`public/samples/drums/<kitId>/`. The default kit id is `default`, expecting:

- `kick.wav`
- `snare.wav`
- `hat.wav`
- `crash.wav`

## Requirements
- Openly licensed: **CC0** (preferred) or **CC-BY** (record attribution below).
- One-shots, trimmed, mono or stereo, 44.1 kHz, ideally < ~150 KB each.

## How to add the kit
Obtain four CC0/CC-BY drum one-shots, rename to the filenames above, and place them in
`public/samples/drums/default/`. A good source is a CC0 drum pack from freesound.org or
a CC0 kit bundled with an open drum-machine project.

> **Status:** the WAV binaries are NOT yet committed — they are a human-supplied asset
> (the coding workflow cannot acquire licensed binary audio). Until they are present,
> `DrumKit.isReady()` stays `false` and the percussion layer silently no-ops; the rest
> of Remix runs normally. Drop the four files in to enable drum hits.

## Attribution (fill in if CC-BY)
- kick: <source / author / licence>
- snare: <source / author / licence>
- hat: <source / author / licence>
- crash: <source / author / licence>
