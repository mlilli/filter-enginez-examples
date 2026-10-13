/* global React, Icon */

function DevtoolsPanel({ open, log, onClose, onJump, activeIdx }) {
  return (
    <aside className={"fe-devtools" + (open ? " open" : "")}>
      <header className="fe-devtools-head">
        <div className="fe-devtools-title">DEVTOOLS · ACTION LOG</div>
        <button className="fe-icon-btn ghost" onClick={onClose}><Icon name="x" size={14}/></button>
      </header>
      <div className="fe-devtools-meta">
        <span>{log.length} actions</span>
        <span>·</span>
        <span>at step <strong className="fe-mono fe-cyan">#{activeIdx + 1}</strong></span>
      </div>
      <div className="fe-devtools-log">
        {log.length === 0 && (
          <div className="fe-devtools-empty">no actions yet · interact with filters to start the log</div>
        )}
        {log.map((entry, i) => (
          <div key={i} className={"fe-devtools-entry" + (i === activeIdx ? " active" : "")}
               onClick={() => onJump(i)}>
            <span className="fe-devtools-ts">{entry.ts}</span>
            <span className={"fe-devtools-type " + entry.kind}>{entry.action}</span>
            <span className="fe-devtools-args">{entry.args}</span>
            <span className="fe-devtools-arrow">{i === activeIdx ? "●" : "→"}</span>
          </div>
        ))}
      </div>
      <footer className="fe-devtools-foot">
        <div className="fe-scrubber">
          <div className="fe-scrubber-track">
            <div className="fe-scrubber-fill" style={{ width: log.length === 0 ? "0%" : `${((activeIdx + 1) / log.length) * 100}%` }}/>
          </div>
          <div className="fe-scrubber-stops">
            {log.map((_, i) => (
              <div key={i} className={"fe-scrubber-stop" + (i === activeIdx ? " active" : "") + (i <= activeIdx ? " filled" : "")}
                   style={{ left: `${(i / Math.max(1, log.length - 1)) * 100}%` }}
                   onClick={() => onJump(i)}/>
            ))}
          </div>
        </div>
        <div className="fe-scrubber-info">
          <span className="fe-mono">scrub timeline · click an action to jump</span>
        </div>
      </footer>
    </aside>
  );
}

window.FEDevtoolsPanel = DevtoolsPanel;
