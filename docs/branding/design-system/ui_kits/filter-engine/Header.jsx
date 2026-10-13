/* global React, Icon, FezMark */

function Header({ dataset, datasets, onSwitch, onUndo, onRedo, canUndo, canRedo, pulsing, onToggleDevtools, devtoolsOpen }) {
  return (
    <header className="fe-header">
      <div className="fe-brand">
        <div className="fe-mark">
          <FezMark size={32} mode="primary" animated/>
        </div>
        <div className="fe-wordmark">FILTER ENGINE<span className="fe-wordmark-z">Z</span></div>
        <div className="fe-domain">{dataset.domain}</div>
      </div>

      <nav className="fe-nav">
        {datasets.map(d => (
          <button key={d.id}
                  className={"fe-nav-btn" + (d.id === dataset.id ? " active" : "")}
                  onClick={() => onSwitch(d.id)}>
            <Icon name={d.id === "real-estate" ? "home" : d.id === "wine" ? "wine" : "book"} size={14}/>
            {d.name}
          </button>
        ))}
      </nav>

      <div className="fe-actions">
        <button className={"fe-icon-btn" + (pulsing === "undo" ? " just-acted" : "")}
                disabled={!canUndo} onClick={onUndo} title="Undo (⌘Z)"><Icon name="undo" size={16}/></button>
        <button className={"fe-icon-btn" + (pulsing === "redo" ? " just-acted" : "")}
                disabled={!canRedo} onClick={onRedo} title="Redo (⌘⇧Z)"><Icon name="redo" size={16}/></button>
        <div className="fe-divider"/>
        <button className={"fe-icon-btn" + (devtoolsOpen ? " on" : "")} onClick={onToggleDevtools} title="Devtools">
          <Icon name="terminal" size={16}/>
        </button>
      </div>
    </header>
  );
}

window.FEHeader = Header;
