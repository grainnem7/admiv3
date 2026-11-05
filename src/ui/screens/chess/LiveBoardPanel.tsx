/**
 * The real board under the camera: find it, learn it from the start position, then listen.
 * Each settled reading goes to the live game, which plays any move found in it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraManager } from '../../../tracking/CameraManager';
import { captureDisplayedFrame } from '../../../tracking/boardDetect/captureFrame';
import { detectBoard } from '../../../tracking/boardDetect/detectBoard';
import { buildWatchGrid, initialWatchState, stepWatcher, type WatchGrid, type WatchState } from '../../../tracking/handGuard/intruderMask';
import { applyHomography, computeHomography, UNIT_SQUARE } from '../../../utils/homography';
import {
  cellFeatures, learnFromStart, readOccupancy, slantOf, squareAt, SLANT_LIMIT, START_OCCUPANCY,
  type BoardCorners, type BoardModel, type Occupancy,
} from '../../../tracking/chess/chessOccupancy';
import { OccupancySettler } from '../../../tracking/chess/occupancySettler';
import { occupancyOfFen } from '../../../songs/chess/moveFromBoard';
import { useLiveChessStore } from '../../../songs/chess/liveChessStore';

const READ_MS = 100;
const FRAME_W = 640;
const big: React.CSSProperties = { minHeight: 44, minWidth: 44, padding: '0 16px', fontSize: 17 };
const SIDE_WORDS = { bottom: 'at the bottom of', top: 'at the top of', left: 'on the left of', right: 'on the right of' } as const;
// The hand watcher, as the board sequencer sets it.
const WATCH = { sensitivity: 18, marginSquares: 0.75, releaseMs: 250, restNudgeMs: 4000 };

export function LiveBoardPanel({ startSound }: { startSound: () => Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const settlerRef = useRef(new OccupancySettler());
  const watchRef = useRef<{ grid: WatchGrid; state: WatchState } | null>(null);
  const lastRef = useRef(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [corners, setCorners] = useState<BoardCorners | null>(null);
  const [taps, setTaps] = useState<{ x: number; y: number }[] | null>(null);
  const [model, setModel] = useState<BoardModel | null>(null);
  const [note, setNote] = useState<string>('');
  const [slanted, setSlanted] = useState(false);
  const [listening, setListening] = useState(false);
  const [hand, setHand] = useState(false);
  const newGame = useLiveChessStore((s) => s.newGame);

  const startCamera = async (id?: string): Promise<void> => {
    const video = videoRef.current;
    if (!video) return;
    cameraRef.current?.stop();
    const cam = new CameraManager();
    cameraRef.current = cam;
    try {
      await cam.start(video, id || undefined);
      setCameraOn(true);
      setNote('Camera on. Set up the pieces at the start, then press Find the board.');
      const all = await CameraManager.listDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch {
      setNote('The camera did not start. Check that no other app is using it.');
    }
  };

  useEffect(() => () => { cameraRef.current?.stop(); }, []);

  const grab = useCallback(() => {
    const v = videoRef.current;
    return v ? captureDisplayedFrame(v, false, false, FRAME_W) : null;
  }, []);

  const takeCorners = (c: BoardCorners, width: number, height: number): void => {
    setCorners(c);
    setModel(null);
    watchRef.current = null;
    const tilt = slantOf(c, width, height) > SLANT_LIMIT;
    setSlanted(tilt);
    setNote(tilt
      ? 'The board looks slanted: put the camera more straight above the board, then find it again.'
      : 'Board found. With the pieces at the start, press Learn the start position.');
  };

  const findBoard = (): void => {
    const f = grab();
    if (!f) return;
    const d = detectBoard(f.data, f.width, f.height, { sizes: [8] });
    if (d.corners && (d.status === 'high' || d.status === 'low')) takeCorners(d.corners, f.width, f.height);
    else {
      setTaps([]);
      setNote('I could not find the board by itself. Tap its four outer corners on the picture: top left, top right, bottom right, bottom left.');
    }
  };

  const onPictureTap = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!taps) return;
    const r = e.currentTarget.getBoundingClientRect();
    const next = [...taps, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }];
    if (next.length < 4) { setTaps(next); return; }
    setTaps(null);
    const f = grab();
    takeCorners(next as unknown as BoardCorners, f?.width ?? 4, f?.height ?? 3);
  };

  const learn = (): void => {
    const f = grab();
    if (!f || !corners) return;
    const feats = cellFeatures(f, corners);
    const m = learnFromStart(feats);
    const read = m ? readOccupancy(feats, m) : null;
    const wrong = read ? read.filter((s, i) => s !== START_OCCUPANCY[i]).length : 64;
    if (!m || wrong > 2) {
      setNote('That did not look like the start position. Check every piece is on its start square and the light is even, then try again.');
      return;
    }
    setModel(m);
    setNote(`Learnt the board. White sits ${SIDE_WORDS[m.whiteAt]} the picture. Press Play to start listening.`);
  };

  const play = async (): Promise<void> => {
    await startSound();
    settlerRef.current.reset(occupancyOfFen(useLiveChessStore.getState().fen));
    setListening(true);
  };

  // Read the board ten times a second once it is learnt; draw what is read.
  useEffect(() => {
    if (!cameraOn || !corners || !model) return;
    const id = setInterval(() => {
      const f = grab();
      if (!f) return;
      const reading = readOccupancy(cellFeatures(f, corners), model);
      const now = performance.now();
      const dt = lastRef.current ? now - lastRef.current : READ_MS;
      lastRef.current = now;
      if (!watchRef.current) {
        const h = computeHomography(UNIT_SQUARE, corners.map((p) => ({ x: p.x * f.width, y: p.y * f.height })));
        watchRef.current = { grid: buildWatchGrid(h, { width: f.width, height: f.height, downscale: 1 }, 8, 8, 8), state: initialWatchState() };
      }
      const w = stepWatcher(watchRef.current.state, watchRef.current.grid, f.data, now, { ...WATCH, dtMs: dt });
      watchRef.current.state = w.state;
      const handNow = w.ready && (w.heldCells.size > 0 || w.global);
      setHand(handNow);
      draw(canvasRef.current, corners, reading, model);
      if (!listening) return;
      const settled = settlerRef.current.step(reading, handNow, now);
      if (settled) useLiveChessStore.getState().seen(settled);
    }, READ_MS);
    return () => clearInterval(id);
  }, [cameraOn, corners, model, listening, grab]);

  // Draw the corners (and taps so far) when there is no reading yet.
  useEffect(() => {
    if (!model) draw(canvasRef.current, corners, null, null, taps ?? []);
  }, [corners, model, taps]);

  return (
    <section aria-label="The real board" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
      <div style={{ position: 'relative', width: '100%', background: '#222', minHeight: cameraOn ? 0 : 120 }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', display: 'block' }} />
        <canvas ref={canvasRef} width={640} height={480} onClick={onPictureTap}
          aria-label={taps ? `Tap corner ${taps.length + 1} of 4` : 'What the camera reads'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: taps ? 'crosshair' : 'default' }} />
      </div>
      <p role="status" style={{ fontSize: 17, margin: 0 }}>{note || 'Put the camera straight above the board, then start it.'}</p>
      {slanted && <p role="alert" style={{ fontSize: 17, margin: 0, color: '#f2994a' }}>The camera is not straight above the board, so pieces may be misread.</p>}
      {listening && <p style={{ fontSize: 17, margin: 0 }} aria-live="polite">{hand ? 'A hand is over the board: waiting.' : 'Listening to the board.'}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!cameraOn && <button className="btn btn--primary" style={big} onClick={() => { void startCamera(); }}>Start the camera</button>}
        {cameraOn && devices.length > 1 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17 }}>
            Camera
            <select value={deviceId} style={{ minHeight: 44, fontSize: 17 }}
              onChange={(e) => { setDeviceId(e.target.value); void startCamera(e.target.value); }}>
              <option value="">First camera</option>
              {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          </label>
        )}
        {cameraOn && <button className="btn btn--ghost" style={big} onClick={findBoard}>Find the board</button>}
        {cameraOn && <button className="btn btn--ghost" style={big} onClick={() => { setTaps([]); setModel(null); setNote('Tap the board’s four outer corners: top left, top right, bottom right, bottom left.'); }}>Tap the corners</button>}
        {cameraOn && corners && <button className="btn btn--ghost" style={big} onClick={learn}>Learn the start position</button>}
        {model && !listening && <button className="btn btn--primary" style={big} onClick={() => { void play(); }}>Play</button>}
        {listening && <button className="btn btn--primary" style={big} onClick={() => setListening(false)}>Stop listening</button>}
        {model && <button className="btn btn--ghost" style={big} onClick={() => { newGame(); settlerRef.current.reset(START_OCCUPANCY); }}>New game</button>}
      </div>
    </section>
  );
}

/** The board's outline and grid on the picture, and what each square reads as. */
function draw(canvas: HTMLCanvasElement | null, corners: BoardCorners | null, reading: Occupancy | null, model: BoardModel | null, taps: { x: number; y: number }[] = []): void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const W = canvas.width; const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#2d9cdb';
  for (const t of taps) { ctx.beginPath(); ctx.arc(t.x * W, t.y * H, 8, 0, Math.PI * 2); ctx.fill(); }
  if (!corners) return;
  const h = computeHomography(UNIT_SQUARE, corners.map((p) => ({ x: p.x * W, y: p.y * H })));
  const at = (u: number, v: number): { x: number; y: number } => applyHomography(h, { x: u, y: v });
  ctx.strokeStyle = 'rgba(45,156,219,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const a = at(i / 8, 0); const b = at(i / 8, 1); const c = at(0, i / 8); const d = at(1, i / 8);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
  }
  if (!reading || !model) return;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const s = reading[squareAt(row, col, model.whiteAt)];
    if (s === 'empty') continue;
    const p = at((col + 0.5) / 8, (row + 0.5) / 8);
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = s === 'white' ? '#ffffff' : '#000000';
    ctx.strokeStyle = s === 'white' ? '#000000' : '#ffffff';
    ctx.fill(); ctx.stroke();
  }
}
