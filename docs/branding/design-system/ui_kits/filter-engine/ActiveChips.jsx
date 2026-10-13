/* global React, Icon */

function ActiveChips({ dataset, selections, onRemove, onClearAll }) {
  const chips = [];
  dataset.filters.forEach(f => {
    if (f.type === "checkbox") {
      const sel = selections[f.id] || [];
      sel.forEach(optId => {
        const opt = f.options.find(o => o.id === optId);
        if (opt) chips.push({ key: `${f.id}:${optId}`, group: f.title.toLowerCase(), label: opt.label, fid: f.id, oid: optId });
      });
    }
    if (f.type === "range") {
      const v = selections[f.id];
      if (v && (v[0] !== f.lo || v[1] !== f.hi)) {
        chips.push({ key: `${f.id}:range`, group: f.title.toLowerCase(), label: `${f.format(v[0])}–${f.format(v[1])}`, fid: f.id, oid: null, isRange: true });
      }
    }
  });

  if (chips.length === 0) {
    return (
      <div className="fe-chip-bar empty">
        <span className="fe-empty-note">No active filters · showing all {dataset.total.toLocaleString()} results</span>
      </div>
    );
  }

  return (
    <div className="fe-chip-bar">
      <span className="fe-chip-count">{chips.length} {chips.length === 1 ? "filter" : "filters"}</span>
      <div className="fe-chip-wrap">
        {chips.map(c => (
          <div key={c.key} className="fe-chip">
            <span className="fe-chip-dot"/>
            <span className="fe-chip-group">{c.group}</span>
            <span className="fe-chip-label">{c.label}</span>
            <span className="fe-chip-x" onClick={() => onRemove(c.fid, c.oid, c.isRange)}>
              <Icon name="x" size={12}/>
            </span>
          </div>
        ))}
        <button className="fe-clear" onClick={onClearAll}>Clear all</button>
      </div>
    </div>
  );
}

window.FEActiveChips = ActiveChips;
