import { useCallback, useEffect, useRef, useState } from 'react';
import { parseRemoteMessage, REMOTE_PATH, type RemoteMessage } from './protocol';

export type RemoteLinkStatus = 'off' | 'connecting' | 'open' | 'lost';

/** Wait this long before trying again after the link drops (Wi-Fi blip, laptop asleep). */
const RETRY_MS = 1500;

/**
 * One end of the iPad link. Connects while `enabled`, reconnects by itself if the link
 * drops, and hands every well-formed message to `onMessage`. `peers` says whether the
 * other side is there: a link with nobody at the other end is not "connected".
 */
export function useRemoteLink(
  role: 'host' | 'remote',
  code: string,
  enabled: boolean,
  onMessage: (msg: RemoteMessage) => void,
): { status: RemoteLinkStatus; others: number; send(msg: RemoteMessage): void } {
  const [status, setStatus] = useState<RemoteLinkStatus>('off');
  const [others, setOthers] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setOthers(0);
      return;
    }
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = (): void => {
      if (stopped) return;
      setStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}${REMOTE_PATH}?code=${encodeURIComponent(code)}&role=${role}`);
      wsRef.current = ws;
      ws.onopen = () => setStatus('open');
      ws.onmessage = (ev) => {
        const msg = parseRemoteMessage(typeof ev.data === 'string' ? ev.data : '');
        if (!msg) return;
        if (msg.type === 'peers') setOthers(role === 'host' ? msg.remotes : msg.hosts);
        else onMessageRef.current(msg);
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setOthers(0);
        if (stopped) return;
        setStatus('lost');
        retry = setTimeout(open, RETRY_MS);
      };
    };
    open();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [role, code, enabled]);

  const send = useCallback((msg: RemoteMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { status, others, send };
}
