import type { KeptIdea } from '../src/songs/performance/ideas';

/** Each demo scene's kept ideas, by scene id, from a backup (the parsed JSON of the file). */
export function freezeDemoIdeas(backup: unknown): Record<string, KeptIdea[]>;
/** The data file's text: the frozen ideas. */
export function demoIdeasSource(frozen: Readonly<Record<string, readonly KeptIdea[]>>): string;
