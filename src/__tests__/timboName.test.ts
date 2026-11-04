/**
 * The app is called Timbo on screen (owner, 4 Nov 2026). "ADMI" stays only where it is a
 * real name the owner types or sees in other software: the loopMIDI port ADMIOutput and the
 * Ableton sets "ADMI template" / "ADMI template 33".
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OTHER_TAB_NOTE, OTHER_TAB_WARNING } from '../ui/screens/boardSequencer/headerNotice';
import { OTHER_TAB_SAVES } from '../storage/diskSync';
import { ABLETON_TRACKS_NOTE } from '../ui/screens/boardSequencer/abletonReady';

/** Every "ADMI" that is not a port, a set, or a code name (__ADMI_BUILD_ID__). */
const STRAY = /ADMI(?!Output| template|_)/;

/** The source without its comments (roughly: enough to leave only what is drawn or said). */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('the name on screen is Timbo', () => {
  it('the pages are called Timbo', () => {
    expect(readFileSync('index.html', 'utf-8')).toMatch(/<title>Timbo<\/title>/);
    expect(readFileSync('audience.html', 'utf-8')).toMatch(/<title>Timbo – audience<\/title>/);
    for (const page of ['index.html', 'audience.html']) expect(readFileSync(page, 'utf-8')).not.toMatch(STRAY);
  });

  it('the notices say Timbo', () => {
    expect(OTHER_TAB_NOTE).toBe("Timbo is also open in another tab. That tab can't save: only this one does.");
    expect(OTHER_TAB_WARNING).toBe('Timbo is open in another tab or window. Close all but one, or they will save over each other.');
    expect(OTHER_TAB_SAVES).toBe("Timbo is open in another tab. This one can't save: close the other tab to save here.");
  });

  it('the port keeps its real name', () => {
    expect(ABLETON_TRACKS_NOTE).toContain('MIDI From = the port ADMIOutput');
  });

  it('no screen, panel, notice or Help line says ADMI', () => {
    const stray: string[] = [];
    for (const f of [...files('src/ui'), ...files('src/audience'), 'src/storage/diskSync.ts']) {
      withoutComments(readFileSync(f, 'utf-8')).split('\n').forEach((line, i) => {
        if (STRAY.test(line)) stray.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(stray).toEqual([]);
  });
});
