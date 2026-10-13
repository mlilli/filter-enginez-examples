/* global React, Icon */

const { useState } = React;

function FilterSection({ title, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fe-section">
      <button className="fe-section-head" onClick={() => setOpen(!open)}>
        <span className="fe-section-title">{title}</span>
        {count > 0 && <span className="fe-section-badge">{count} active</span>}
        <span className={"fe-section-caret" + (open ? "" : " collapsed")}>
          <Icon name="chevron" size={14}/>
        </span>
      </button>
      {open && <div className="fe-section-body">{children}</div>}
    </div>
  );
}

function CheckboxOption({ option, selected, onToggle }) {
  const zero = option.count === 0;
  return (
    <div className={"fe-opt" + (selected ? " selected" : "") + (zero ? " zero" : "")}
         onClick={zero ? undefined : onToggle}
         title={zero ? "selecting this would yield 0 results" : undefined}>
      <span className="fe-check">
        {selected && <Icon name="check" size={10}/>}
      </span>
      <span className="fe-opt-label">{option.label}</span>
      <span className="fe-opt-count">{option.count.toLocaleString()}</span>
    </div>
  );
}

function RangeSlider({ filter, value, onChange }) {
  const { min, max, format, histogram } = filter;
  const [lo, hi] = value;
  const range = max - min;
  const loPct = ((lo - min) / range) * 100;
  const hiPct = ((hi - min) / range) * 100;

  const buckets = histogram.length;
  const maxBucket = Math.max(...histogram);
  const loBucket = Math.floor((lo - min) / range * buckets);
  const hiBucket = Math.floor((hi - min) / range * buckets);

  function thumbDrag(side) {
    return (e) => {
      e.preventDefault();
      const track = e.currentTarget.parentElement;
      const rect = track.getBoundingClientRect();
      const onMove = (mv) => {
        const x = Math.max(0, Math.min(rect.width, mv.clientX - rect.left));
        const v = min + (x / rect.width) * range;
        if (side === "lo") onChange([Math.min(v, hi - range * 0.02), hi]);
        else onChange([lo, Math.max(v, lo + range * 0.02)]);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  return (
    <div className="fe-range">
      <div className="fe-range-head">
        <span className="fe-range-vals">{format(lo)} — {format(hi)}</span>
      </div>
      <div className="fe-histo">
        {histogram.map((h, i) => {
          const inRange = i >= loBucket && i <= hiBucket;
          return <div key={i} className={"fe-bar" + (inRange ? " in" : "")}
                      style={{ height: `${(h / maxBucket) * 100}%` }}/>;
        })}
      </div>
      <div className="fe-track">
        <div className="fe-track-fill" style={{ left: loPct + "%", right: (100 - hiPct) + "%" }}/>
        <div className="fe-thumb" style={{ left: `calc(${loPct}% - 8px)` }} onPointerDown={thumbDrag("lo")}/>
        <div className="fe-thumb" style={{ left: `calc(${hiPct}% - 8px)` }} onPointerDown={thumbDrag("hi")}/>
      </div>
      <div className="fe-range-nums">
        <div className="fe-num">{format(lo)}</div>
        <div className="fe-num">{format(hi)}</div>
      </div>
    </div>
  );
}

function Sidebar({ filters, selections, onToggleOption, onChangeRange }) {
  return (
    <aside className="fe-sidebar">
      <div className="fe-sidebar-head">
        <div className="fe-sidebar-title">Filters</div>
      </div>
      <div className="fe-sidebar-body">
        {filters.map(f => {
          if (f.type === "checkbox") {
            const sel = selections[f.id] || [];
            return (
              <FilterSection key={f.id} title={f.title} count={sel.length}>
                {f.options.map(o => (
                  <CheckboxOption key={o.id} option={o}
                    selected={sel.includes(o.id)}
                    onToggle={() => onToggleOption(f.id, o.id)}/>
                ))}
              </FilterSection>
            );
          }
          if (f.type === "range") {
            const val = selections[f.id] || [f.lo, f.hi];
            const isDefault = val[0] === f.lo && val[1] === f.hi;
            return (
              <FilterSection key={f.id} title={f.title} count={isDefault ? 0 : 1}>
                <RangeSlider filter={f} value={val} onChange={(v) => onChangeRange(f.id, v)}/>
              </FilterSection>
            );
          }
          return null;
        })}
      </div>
    </aside>
  );
}

window.FESidebar = Sidebar;
