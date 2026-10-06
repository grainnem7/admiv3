/**
 * The iPad link, running inside the local dev/preview server (see vite.config.ts).
 *
 * Laptop ("host") and iPad ("remote") both open a WebSocket to REMOTE_PATH with the same
 * 4-digit code. The relay passes each side's messages to the other side of the SAME code
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

type Role = 'host' | 'remote';
interface Member { ws: WebSocket; role: Role }

/** Larger than any real message; anything bigger is not from ADMI. */
const MAX_MESSAGE_BYTES = 4096;

/** Who may send what: the iPad sends controls and taps, the laptop sends state. */
export function allowedFrom(role: Role, type: string): boolean {
  return role === 'remote' ? type === 'control' || type === 'trigger' || type === 'reach' : type === 'state';
}

export function attachRemoteRelay(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const rooms = new Map<string, Set<Member>>();

  const announce = (code: string): void => {
    const room = rooms.get(code);
    if (!room) return;
    const peers = JSON.stringify({
      type: 'peers',
      hosts: [...room].filter((m) => m.role === 'host').length,
      remotes: [...room].filter((m) => m.role === 'remote').length,
    });
    for (const m of room) m.ws.send(peers);
  };

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    // Not ours (Vite's own hot reload uses this server too): leave it alone.
    if (url.pathname !== REMOTE_PATH) return;
    const code = url.searchParams.get('code');
    const role = url.searchParams.get('role');
    if (!isRemoteCode(code) || (role !== 'host' && role !== 'remote')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const member: Member = { ws, role };
      const room = rooms.get(code) ?? new Set<Member>();
      room.add(member);
      rooms.set(code, room);
      announce(code);
      ws.on('message', (data) => {
        const text = data.toString();
        const msg = parseRemoteMessage(text);
        if (!msg || !allowedFrom(role, msg.type)) return;
        for (const other of room) {
          if (other.role !== role && other.ws.readyState === other.ws.OPEN) other.ws.send(text);
        }
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
