/** The evaluation over the game as a line: up is White ahead, down is Black ahead. */
const W = 320;
const H = 90;
const CLAMP = 1000;

export function evalWords(cp: number): string {
  if (Math.abs(cp) >= 10000) return cp > 0 ? 'White has checkmate' : 'Black has checkmate';
  const pawns = Math.abs(cp) / 100;
  if (pawns < 0.3) return 'Even';
  return `${cp > 0 ? 'White' : 'Black'} ahead by ${pawns.toFixed(1)} pawns`;
}

export function EvalLine({ evals }: { evals: readonly number[] }) {
  const last = evals.at(-1) ?? 0;
  const n = Math.max(2, evals.length);
  const pts = evals.map((cp, i) => {
    const v = Math.max(-CLAMP, Math.min(CLAMP, cp));
    return `${(i / (n - 1)) * W},${H / 2 - (v / CLAMP) * (H / 2 - 4)}`;
  }).join(' ');
  return (
    <figure style={{ margin: '0 0 12px' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evaluation: ${evalWords(last)}`}
        style={{ background: '#1e1e24', border: '1px solid #555', maxWidth: '100%' }}>
        <rect x={0} y={0} width={W} height={H / 2} fill="rgba(255,255,255,0.06)" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#777" strokeDasharray="4 4" />
        <polyline points={pts} fill="none" stroke="#f2c94c" strokeWidth={2.5} />
      </svg>
      <figcaption style={{ fontSize: 16 }}>{evalWords(last)}</figcaption>
    </figure>
  );
}
