/**
 * The engine's heartbeat: a call every few milliseconds that schedules the next beats.
 *
 * Run from a small worker when the browser has one. A page's own timers are slowed to about
 * once a second when the page is hidden, and on the show laptop it is hidden whenever
 * Ableton's window covers the browser: the beats went out late and ADMI said the sound was
 * falling behind, with nothing overloaded. A worker's timer keeps running at its pace.
 * Where there is no worker (tests, an old browser), a plain interval.
 */

export interface Ticker {
  stop(): void;
}

const WORKER_SOURCE = 'let id=null;onmessage=(e)=>{clearInterval(id);id=null;if(e.data>0)id=setInterval(()=>postMessage(0),e.data);};';

export function startTicker(tick: () => void, everyMs: number): Ticker {
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = () => tick();
      worker.postMessage(everyMs);
      return { stop: () => { worker.postMessage(0); worker.terminate(); } };
    } catch {
      // Workers refused (a strict page policy): the plain interval below.
    }
  }
  const id = setInterval(tick, everyMs);
  return { stop: () => clearInterval(id) };
}
