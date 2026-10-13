/* global React, Icon, FESynapticOrbit, FENeuralCluster */

const { useState, useEffect, useRef } = React;

function useTickingNumber(target) {
  const [n, setN] = useState(target);
  const [animating, setAnimating] = useState(false);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    setAnimating(true);
    const t0 = performance.now();
    const dur = 600;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      setN(v);
      fromRef.current = v;
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setAnimating(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return [n, animating];
}

function ResultCard({ r }) {
  return (
    <div className="fe-card">
      <div className="fe-card-photo">
        {r.badge && <span className="fe-card-badge">{r.badge}</span>}
        <Icon name={r.icon} size={36}/>
      </div>
      <div className="fe-card-body">
        <div className="fe-card-price">
          {r.icon === "book"
            ? `$${r.price.toFixed(2)}`
            : `$${r.price.toLocaleString()}`}
        </div>
        <div className="fe-card-title">{r.title}</div>
        <div className="fe-card-attrs">
          {r.attrs.map((a, i) => <span key={i}>{a}</span>)}
        </div>
      </div>
    </div>
  );
}

function ResultsGrid({ dataset, count, totalCount }) {
  const [animatedCount, isAnimating] = useTickingNumber(count);
  const delta = count - totalCount;
  return (
    <section className="fe-results">
      <header className="fe-results-head">
        <div className="fe-results-count-block">
          <div className={"fe-results-count" + (isAnimating ? " computing" : "")}>{animatedCount.toLocaleString()}</div>
          <div className="fe-results-count-lbl">results</div>
          {delta !== 0 && (
            <div className={"fe-results-delta " + (delta < 0 ? "down" : "up")}>
              {delta > 0 ? "+" : ""}{delta.toLocaleString()}
            </div>
          )}
          <div className={"fe-engine-status" + (isAnimating ? " active" : "")}
               title={isAnimating ? "engine: computing" : "engine: idle"}>
            {isAnimating ? <FENeuralCluster size={20}/> : <FESynapticOrbit size={20}/>}
            <span>engine · {isAnimating ? "computing" : "idle"}</span>
          </div>
        </div>
        <div className="fe-results-ctrls">
          <button className="fe-icon-btn"><Icon name="grid" size={14}/></button>
          <button className="fe-icon-btn ghost"><Icon name="list" size={14}/></button>
          <div className="fe-divider"/>
          <button className="fe-sort">Sort by: relevance <Icon name="chevron" size={12}/></button>
        </div>
      </header>
      <div className="fe-grid">
        {dataset.results.map(r => <ResultCard key={r.id} r={r}/>)}
      </div>
    </section>
  );
}

window.FEResultsGrid = ResultsGrid;
