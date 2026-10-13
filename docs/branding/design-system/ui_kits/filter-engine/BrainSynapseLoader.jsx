/* global React */

const { useMemo } = React;

function poissonNodes(seed, n, w, h, pad = 16) {
  // Jittered grid — pseudo-Poisson distribution
  const cols = Math.ceil(Math.sqrt((n * w) / h));
  const rows = Math.ceil(n / cols);
  const cellW = (w - pad * 2) / cols;
  const cellH = (h - pad * 2) / rows;
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (pts.length >= n) break;
      pts.push({
        x: pad + c * cellW + cellW * (0.2 + rnd() * 0.6),
        y: pad + r * cellH + cellH * (0.2 + rnd() * 0.6),
      });
    }
  }
  return pts;
}

function nearestEdges(pts, k = 2) {
  const edges = new Set();
  pts.forEach((p, i) => {
    const dists = pts.map((q, j) => ({ j, d: i === j ? Infinity : Math.hypot(p.x - q.x, p.y - q.y) }));
    dists.sort((a, b) => a.d - b.d);
    for (let n = 0; n < k; n++) {
      const j = dists[n].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      edges.add(key);
    }
  });
  return Array.from(edges).map(k => k.split("-").map(Number));
}

function BrainSynapseLoader({ width = 600, height = 220, intensity = 1, label = "loading" }) {
  const W = width, H = height;
  const data = useMemo(() => {
    const pts = poissonNodes(7, 38, W, H);
    const edges = nearestEdges(pts, 2);
    return { pts, edges };
  }, [W, H]);

  // Pick a few pulses to animate (deterministic)
  const pulses = useMemo(() => {
    const count = Math.max(3, Math.round(intensity * 7));
    return data.edges.slice(0, count).map(([a, b], i) => {
      const p1 = data.pts[a], p2 = data.pts[b];
      return { id: i, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, delay: (i * 0.4) % 3 };
    });
  }, [data, intensity]);

  // Pick a subset of nodes to "fire"
  const firingNodes = useMemo(() => {
    const ids = [];
    const step = Math.max(1, Math.round(data.pts.length / (8 * intensity)));
    for (let i = 0; i < data.pts.length; i += step) ids.push(i);
    return new Set(ids);
  }, [data, intensity]);

  return (
    <div className="fe-loader">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
           width="100%" height="100%">
        {data.edges.map(([a, b], i) => (
          <line key={i}
                x1={data.pts[a].x} y1={data.pts[a].y}
                x2={data.pts[b].x} y2={data.pts[b].y}
                className="fe-loader-edge"/>
        ))}
        {data.pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5"
                  className={"fe-loader-node" + (firingNodes.has(i) ? " fire" : "")}
                  style={{ animationDelay: `${(i % 8) * 0.25}s` }}/>
        ))}
        {pulses.map(p => {
          const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
          return (
            <circle key={p.id} r="2.5" className="fe-loader-pulse"
                    style={{
                      animationDelay: `${p.delay}s`,
                      "--x0": `${p.x1}px`, "--y0": `${p.y1}px`,
                      "--dx": `${dx}px`,  "--dy": `${dy}px`,
                    }}/>
          );
        })}
      </svg>
      <div className="fe-loader-label">
        <span className="fe-loader-dot"/>{label}
      </div>
    </div>
  );
}

window.FEBrainSynapseLoader = BrainSynapseLoader;
