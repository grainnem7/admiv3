# ADMIv3

This repository contains ADMIv3 — a browser-based interactive mapping/music project built with TypeScript and Vite.

## Quick start

- Install dependencies:

```
npm install
```

- Run development server:

```
npm run dev
```

- Build for production:

```
npm run build
```

- Run tests (if present):

```
npm test
```

Midi setup guide · MD
Copy

# MIDI Setup Guide (Windows + Chrome + Ableton Live)

This guide explains how to configure the ADMI web app to send MIDI into Ableton Live on Windows using Chrome and loopMIDI.

## 1. One-Time Setup

### 1. Install loopMIDI

1. Download loopMIDI: https://www.tobias-erichsen.de/software/loopmidi.html  
2. Install and open loopMIDI.  
3. In *New port-name*, type:
   ADMIOutput
4. Click **+** to create the virtual MIDI port.

### 2. Configure Chrome to Use the Correct MIDI Backend

Recent Chrome versions use a MIDI system that cannot see virtual MIDI ports on Windows.  
Disable the WinRT MIDI backend:

1. Open Chrome.
2. Go to:
   chrome://flags/#use-winrt-midi-api
3. Set **Use Windows Runtime MIDI API → Disabled**.
4. Restart Chrome completely (close all windows).

### 3. Allow MIDI Permissions in Chrome

1. Open the ADMI web app in Chrome.
2. When Chrome prompts for MIDI access, click **Allow**.
3. To review or modify permissions later, visit:
   chrome://settings/content/midiDevices

Ensure your ADMI domain (e.g., http://localhost:3000) is listed under **Allowed**.

### 4. Enable the Virtual Port in Ableton Live

1. Open Ableton → **Preferences → Link, Tempo & MIDI**.
2. Under **Input Ports**, locate `ADMIOutput`.
3. Enable:
   - **Track**
   - **Remote**

## 2. Steps Required Each Time You Use the App

### A. Start loopMIDI

- Open loopMIDI before opening Chrome.
- Ensure the `ADMIOutput` port exists and is active.

### B. Create and Configure a MIDI Track in Ableton

Create a new MIDI track, then configure:

- MIDI From: **ADMIOutput**
- Channel: **All Channels**
- Monitor: **In**
- Arm: **On** (red)

Load any instrument (Piano, Simpler, Drum Rack, etc.).

### C. Enable MIDI Output in the ADMI Web App

1. Open **Settings** in the ADMI app.
2. Enable **MIDI Output**.
3. Select:
   Output Device: **ADMIOutput**

## 3. Testing MIDI Connectivity

To verify that Chrome can send MIDI to Ableton, run this in Chrome DevTools (Console):

```js
navigator.requestMIDIAccess().then(m => {
  const out = [...m.outputs.values()][0];
  out.open().then(() => {
    out.send([0x90, 60, 100]); // Note On (C4)
    setTimeout(() => out.send([0x80, 60, 0]), 300); // Note Off
  });
});
```

If everything is working:

- Ableton's MIDI indicator flashes.
- The armed MIDI track meter moves.
- The instrument plays a note.
- loopMIDI's data counter increases.

## 4. Troubleshooting

### Issue: No sound in Ableton

- Track is armed.
- Monitor = In.
- An instrument is loaded.
- Audio output device is configured correctly.

### Issue: Ableton's MIDI light does not flash

Check:

- Ableton Preferences → ADMIOutput has Track and Remote enabled.
- Track routing is:
  - MIDI From: ADMIOutput
  - Monitor: In

### Issue: Chrome shows no MIDI outputs

Run:

```js
navigator.requestMIDIAccess().then(m => console.log([...m.outputs.values()]));
```

If empty:

- Ensure loopMIDI is open before Chrome.
- Confirm the Chrome flag is disabled.
- Restart Chrome.
- Review MIDI permissions (chrome://settings/content/midiDevices).

### Issue: loopMIDI shows data but Ableton does not play notes

Re-check Ableton track routing:

- MIDI From: ADMIOutput
- Monitor: In
- Arm: On

### Issue: ADMI app plays internal sounds but not Ableton

Disable internal audio (if applicable) and ensure MIDI Output is enabled.
