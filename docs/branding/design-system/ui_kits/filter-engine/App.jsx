/* global React, FEHeader, FESidebar, FEActiveChips, FEResultsGrid, FEBrainSynapseLoader, FEDevtoolsPanel */

const { useState, useEffect, useCallback, useRef } = React;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function defaultSelections(dataset) {
  const sel = {};
  dataset.filters.forEach(f => {
    if (f.type === "checkbox") sel[f.id] = [];
    if (f.type === "range") sel[f.id] = [f.lo, f.hi];
  });
  return sel;
}

function simulateCount(dataset, sel) {
  let n = dataset.total;
  dataset.filters.forEach(f => {
    if (f.type === "checkbox") {
      const s = sel[f.id] || [];
      if (s.length > 0) {
        const sum = s.reduce((acc, oid) => {
          const o = f.options.find(o => o.id === oid);
          return acc + (o ? o.count : 0);
        }, 0);
        // Imperfect simulator — approximate intersection by min of constraints
        n = Math.min(n, sum);
      }
    }
    if (f.type === "range") {
      const v = sel[f.id];
      if (v && (v[0] !== f.lo || v[1] !== f.hi)) {
        const span = (v[1] - v[0]) / (f.max - f.min);
        n = Math.round(n * (0.4 + span * 0.6));
      }
    }
  });
  return Math.max(0, n);
}

function App() {
  const datasets = [
    { id: "real-estate", ...window.FE_DATASETS.realEstate },
    { id: "wine",        ...window.FE_DATASETS.wine },
    { id: "books",       ...window.FE_DATASETS.books },
  ];

  const [datasetId, setDatasetId] = useState("real-estate");
  const dataset = datasets.find(d => d.id === datasetId);

  // History stack for undo/redo
  const [history, setHistory] = useState([{ datasetId: "real-estate", sel: defaultSelections(dataset) }]);
  const [cursor, setCursor] = useState(0);
  const [log, setLog] = useState([]);
  const [logCursor, setLogCursor] = useState(-1);

  const [loading, setLoading] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);

  const current = history[cursor];
  const selections = current.sel;

  const pushAction = useCallback((newSel, action, args, kind = "add") => {
    const truncated = history.slice(0, cursor + 1);
    truncated.push({ datasetId, sel: newSel });
    setHistory(truncated);
    setCursor(truncated.length - 1);
    const newLog = log.slice(0, logCursor + 1);
    newLog.push({ ts: timestamp(), action, args, kind });
    setLog(newLog);
    setLogCursor(newLog.length - 1);
  }, [history, cursor, datasetId, log, logCursor]);

  const onSwitchDataset = (id) => {
    if (id === datasetId) return;
    const ds = datasets.find(d => d.id === id);
    setLoading(true);
    setTimeout(() => setLoading(false), 1100);
    setDatasetId(id);
    const fresh = defaultSelections(ds);
    setHistory([{ datasetId: id, sel: fresh }]);
    setCursor(0);
    const next = [...log, { ts: timestamp(), action: "switchDataset", args: ds.name, kind: "switch" }];
    setLog(next);
    setLogCursor(next.length - 1);
  };

  const onToggleOption = (filterId, optionId) => {
    const sel = { ...selections, [filterId]: [...(selections[filterId] || [])] };
    const idx = sel[filterId].indexOf(optionId);
    let action, kind;
    if (idx >= 0) {
      sel[filterId].splice(idx, 1);
      action = "removeRule"; kind = "remove";
    } else {
      sel[filterId].push(optionId);
      action = "addRule"; kind = "add";
    }
    const f = dataset.filters.find(x => x.id === filterId);
    pushAction(sel, action, `InSetRule<${filterId}> { ${optionId} }`, kind);
  };

  const onChangeRange = (filterId, value) => {
    const sel = { ...selections, [filterId]: value };
    const f = dataset.filters.find(x => x.id === filterId);
    pushAction(sel, "updateRule", `RangeRule<${filterId}> [${f.format(value[0])}, ${f.format(value[1])}]`, "update");
  };

  const onClearAll = () => {
    const fresh = defaultSelections(dataset);
    pushAction(fresh, "clearRules", "all", "clear");
  };

  const onRemoveChip = (filterId, optionId, isRange) => {
    const sel = { ...selections };
    if (isRange) {
      const f = dataset.filters.find(x => x.id === filterId);
      sel[filterId] = [f.lo, f.hi];
    } else {
      sel[filterId] = (selections[filterId] || []).filter(id => id !== optionId);
    }
    pushAction(sel, "removeRule", isRange ? `RangeRule<${filterId}>` : `InSetRule<${filterId}> { ${optionId} }`, "remove");
  };

  // Phosphor press-pulse signal — fires on both click + keyboard
  const [pulsing, setPulsing] = useState(null);  /* null | "undo" | "redo" */
  const pulseRef = useRef(null);
  const triggerPulse = (which) => {
    setPulsing(null);
    requestAnimationFrame(() => setPulsing(which));
    if (pulseRef.current) clearTimeout(pulseRef.current);
    pulseRef.current = setTimeout(() => setPulsing(null), 700);
  };

  const onUndo = () => { if (cursor > 0) { setCursor(cursor - 1); setLogCursor(Math.max(-1, logCursor - 1)); triggerPulse("undo"); } };
  const onRedo = () => { if (cursor < history.length - 1) { setCursor(cursor + 1); setLogCursor(Math.min(log.length - 1, logCursor + 1)); triggerPulse("redo"); } };
  const onJumpLog = (i) => {
    setLogCursor(i);
    // Map log cursor back to history cursor — clamp
    setCursor(Math.min(history.length - 1, i + 1));
  };

  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); onUndo(); }
      if (meta && (e.key === "Z" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); onRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const count = simulateCount(dataset, selections);

  return (
    <div className="fe-app">
      <FEHeader dataset={dataset} datasets={datasets} onSwitch={onSwitchDataset}
                onUndo={onUndo} onRedo={onRedo}
                canUndo={cursor > 0} canRedo={cursor < history.length - 1}
                pulsing={pulsing}
                onToggleDevtools={() => setDevtoolsOpen(o => !o)}
                devtoolsOpen={devtoolsOpen}/>
      <div className="fe-body">
        <FESidebar filters={dataset.filters} selections={selections}
                   onToggleOption={onToggleOption} onChangeRange={onChangeRange}/>
        <main className="fe-main">
          <FEActiveChips dataset={dataset} selections={selections}
                         onRemove={onRemoveChip} onClearAll={onClearAll}/>
          {loading ? (
            <div className="fe-main-loader">
              <FEBrainSynapseLoader label={`loading ${dataset.name.toLowerCase()} dataset`}/>
            </div>
          ) : (
            <FEResultsGrid dataset={dataset} count={count} totalCount={dataset.total}/>
          )}
        </main>
        <FEDevtoolsPanel open={devtoolsOpen} log={log} activeIdx={logCursor}
                         onClose={() => setDevtoolsOpen(false)}
                         onJump={onJumpLog}/>
      </div>
    </div>
  );
}

window.FEApp = App;
