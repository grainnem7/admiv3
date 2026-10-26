/**
 * The iPad link, running inside the local dev/preview server (see vite.config.ts).
 *
 * Laptop ("host") and iPad ("remote") both open a WebSocket to REMOTE_PATH with the same
 * 6-digit code. Only ADMI's own page may connect, only the laptop itself may be the host,
 * and a device that keeps trying codes nobody is using is turned away for a while. The relay passes each side's messages to the other side of the SAME code
 * only, and tells both how many of each are connected. It understands nothing else: every
 * message is checked by `parseRemoteMessage` before it is passed on, and anything too big
 * or malformed is dropped.
 *
 * Node only. Never bundled into the app.
 */

import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import { isRemoteCode, parseRemoteMessage, REMOTE_PATH } from './protocol';
import { isLoopback } from '../storage/diskStore';

type Role = 'host' | 'remote';
interface Member { ws: WebSocket; role: Role }

/**
 * Larger than any real message; anything bigger is not from ADMI. The laptop's state
 * carries every loop and scene name, so this has room to spare: at 4 KB a long set list
 * would have closed the laptop's own link.
 */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** A connection that answers no ping for this long is gone (a sleeping iPad, lost Wi-Fi). */
const HEARTBEAT_MS = 5000;

/** Joins to a code with no laptop on it, from one device, before it is turned away. */
export const MAX_MISSES = 8;
export const MISS_WINDOW_MS = 60_000;

/**
 * Counts each device's tries at codes nobody is using. A real iPad joins one code and
 * stays connected while it waits for the laptop; something trying codes one after another
 * runs out of tries within a minute.
 */
export class JoinGuard {
  private misses = new Map<string, number[]>();

  blocked(ip: string, now: number): boolean {
    const recent = (this.misses.get(ip) ?? []).filter((t) => now - t < MISS_WINDOW_MS);
    if (recent.length === 0) this.misses.delete(ip); else this.misses.set(ip, recent);
    return recent.length >= MAX_MISSES;
  }

  miss(ip: string, now: number): void {
    this.misses.set(ip, [...(this.misses.get(ip) ?? []), now].slice(-MAX_MISSES * 2));
  }
}

/**
 * The socket was opened by a page from this same server: ADMI's own page, on the laptop
 * or the iPad. Any other website open in the same browser could otherwise connect.
 */
export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** Who may send what: the iPad sends controls and taps, the laptop sends state. */
export function allowedFrom(role: Role, type: string): boolean {
  return role === 'remote'
    ? type === 'control' || type === 'trigger' || type === 'reach' || type === 'loop' || type === 'scene'
    : type === 'state';
}

export function attachRemoteRelay(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const rooms = new Map<string, Set<Member>>();
  const guard = new JoinGuard();
  // Nothing a client sends may take the server down: it also serves the app, the sound
  // and the saved loops. An unhandled socket error (an oversized message, say) would.
  wss.on('error', () => { /* a bad connection is dropped, the server carries on */ });

  // Heartbeat: a half-open connection still counts as "connected" for minutes, so taps
  // vanish while both screens say all is well. Ping everyone; whoever missed the last
  // ping is closed, and the room is told.
  const alive = new WeakMap<WebSocket, boolean>();
  const beat = setInterval(() => {
    for (const [code, room] of rooms) {
      for (const m of room) {
        if (alive.get(m.ws) === false) { m.ws.terminate(); continue; }
        alive.set(m.ws, false);
        try { m.ws.ping(); } catch { m.ws.terminate(); }
      }
      // The pages can't see pings, so the room's head-count doubles as a heartbeat they
      // can: a page that hears nothing for a while knows its own link has gone.
      announce(code);
    }
  }, HEARTBEAT_MS);
  beat.unref?.();
  server.on('close', () => clearInterval(beat));

  const announce = (code: string): void => {
    const room = rooms.get(code);
    if (!room) return;
    const peers = JSON.stringify({
      type: 'peers',
      hosts: [...room].filter((m) => m.role === 'host').length,
      remotes: [...room].filter((m) => m.role === 'remote').length,
    });
    for (const m of room) if (m.ws.readyState === m.ws.OPEN) m.ws.send(peers);
  };

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    // Not ours (Vite's own hot reload uses this server too): leave it alone.
    if (url.pathname !== REMOTE_PATH) return;
    const code = url.searchParams.get('code');
    const role = url.searchParams.get('role');
    const ip = req.socket.remoteAddress ?? '';
    if (!isRemoteCode(code) || (role !== 'host' && role !== 'remote')
      || !sameOrigin(req.headers.origin, req.headers.host)
      // The laptop is the host: nothing on the network may pose as it and feed the iPad.
      || (role === 'host' && !isLoopback(ip))
      || (role === 'remote' && guard.blocked(ip, Date.now()))) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => { try { ws.terminate(); } catch { /* already gone */ } });
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));
      const member: Member = { ws, role };
      const room = rooms.get(code) ?? new Set<Member>();
      if (role === 'remote' && ![...room].some((m) => m.role === 'host')) guard.miss(ip, Date.now());
      room.add(member);
      rooms.set(code, room);
      announce(code);
      ws.on('message', (data) => {
        try {
          alive.set(ws, true);
          const text = data.toString();
          const msg = parseRemoteMessage(text);
          if (!msg || !allowedFrom(role, msg.type)) return;
          for (const other of room) {
            if (other.role !== role && other.ws.readyState === other.ws.OPEN) other.ws.send(text);
          }
        } catch { /* one bad message never stops the relay */ }
      });
      ws.on('close', () => {
        room.delete(member);
        if (room.size === 0) rooms.delete(code);
        else announce(code);
      });
    });
  });
}

/** This computer's addresses on the local network, for the link shown on the laptop. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}
