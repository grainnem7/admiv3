import { useCallback, useEffect, useRef, useState } from 'react';
import { parseRemoteMessage, REMOTE_PATH, type RemoteMessage } from './protocol';
import { checkReach, heardFromOther, HEARTBEAT_MS, LINK_REACH_START, type LinkReach } from './linkReach';

export type RemoteLinkStatus = 'off' | 'connecting' | 'open' | 'lost';

/** Wait this long before trying again after the link drops (Wi-Fi blip, laptop asleep). */
const RETRY_MS = 1500;
/**
 * The relay sends the head-count every 5 s. Hearing nothing for this long means the link
 * is dead even though the browser still calls it open (a sleeping iPad, a Wi-Fi roam):
 * say so, and connect again.
 */
export const SILENCE_MS = 12000;

/**
 * One end of the iPad link. Connects while `enabled`, reconnects by itself if the link
 * drops, and hands every well-formed message to `onMessage`. `peers` says whether the
 * other side is there: a link with nobody at the other end is not "connected".
 *
 * `heartbeat` is what this side says at least every HEARTBEAT_MS (the iPad a hello, the
 * laptop its state), and `reaching` whether the other side's words are getting through:
 * a stalled Wi-Fi link keeps both sockets "open" while nothing arrives (see linkReach).
 */
export function useRemoteLink(
  role: 'host' | 'remote',
  code: string,
  enabled: boolean,
  onMessage: (msg: RemoteMessage) => void,
  heartbeat?: () => RemoteMessage | null,
): { status: RemoteLinkStatus; others: number; reaching: boolean; send(msg: RemoteMessage): void } {
  const [status, setStatus] = useState<RemoteLinkStatus>('off');
  const [others, setOthers] = useState(0);
  const [reaching, setReaching] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const heartbeatRef = useRef(heartbeat);
  heartbeatRef.current = heartbeat;

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setOthers(0);
      setReaching(false);
      return;
    }
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let lastHeard = Date.now();
    let peers = 0;
    let reach: LinkReach = LINK_REACH_START;
    const look = (): void => {
      const ws = wsRef.current;
      reach = checkReach(reach, performance.now(), ws !== null && ws.readyState === WebSocket.OPEN && peers > 0);
      setReaching(reach.reaching);
    };
    const watchdog = setInterval(() => {
      const ws = wsRef.current;
      if (!stopped && ws && ws.readyState === WebSocket.OPEN && Date.now() - lastHeard > SILENCE_MS) ws.close();
    }, 2000);
    // Say something regularly, and look whether the other side has.
    let lastBeat = 0;
    const beat = setInterval(() => {
      if (stopped) return;
      const ws = wsRef.current;
      const now = performance.now();
      if (now - lastBeat >= HEARTBEAT_MS - 100 && ws && ws.readyState === WebSocket.OPEN) {
        const msg = heartbeatRef.current?.() ?? null;
        if (msg) ws.send(JSON.stringify(msg));
        lastBeat = now;
      }
      look();
    }, HEARTBEAT_MS / 4);
    const open = (): void => {
      if (stopped) return;
      setStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}${REMOTE_PATH}?code=${encodeURIComponent(code)}&role=${role}`);
      wsRef.current = ws;
      ws.onopen = () => { lastHeard = Date.now(); if (!stopped) setStatus('open'); };
      ws.onmessage = (ev) => {
        if (stopped || wsRef.current !== ws) return;
        lastHeard = Date.now();
        const msg = parseRemoteMessage(typeof ev.data === 'string' ? ev.data : '');
        if (!msg) return;
        if (msg.type === 'peers') {
          peers = role === 'host' ? msg.remotes : msg.hosts;
          setOthers(peers);
          look();
        } else {
          // Words from the other side itself (not the relay's head-count): it is reaching.
          reach = heardFromOther(reach, performance.now());
          setReaching(reach.reaching);
          onMessageRef.current(msg);
        }
      };
      ws.onclose = () => {
        // A socket closing after this effect was replaced (a new code, a remount) must not
        // reset the head-count the new socket already has: that left the laptop saying
        // "Waiting for the iPad" with the iPad connected.
        if (stopped || wsRef.current !== ws) return;
        wsRef.current = null;
        peers = 0;
        setOthers(0);
        setStatus('lost');
        look();
        retry = setTimeout(open, RETRY_MS);
      };
    };
    open();
    return () => {
      stopped = true;
      clearInterval(watchdog);
      clearInterval(beat);
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [role, code, enabled]);

  const send = useCallback((msg: RemoteMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { status, others, reaching, send };
}
