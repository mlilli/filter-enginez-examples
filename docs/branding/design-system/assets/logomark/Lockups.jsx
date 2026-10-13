/* global React, FezMark */

/* ============================================================================
   Canonical lockups
   ============================================================================ */

/* D — Horizontal canonical: mark replaces Z in the wordmark */
function LockupHorizontal({ size = 22, mode = "primary", noRings = false }) {
  const markSize = Math.round(size * 1.27);
  return (
    <div className="fez-lockup-h" style={{ fontSize: size }}>
      <span className="fez-wordmark-text">FILTER ENGINE</span>
      <span className="fez-mark-slot" style={{ marginTop: "-3px", marginLeft: "0.06em" }}>
        <FezMark size={markSize} mode={mode} noRings={noRings}/>
      </span>
    </div>
  );
}

/* E — Hero horizontal: same but bigger + no rings (mark fills cap height) */
function LockupHero({ size = 44, mode = "primary" }) {
  return <LockupHorizontal size={size} mode={mode} noRings/>;
}

/* A — Beside: mark beside the full text wordmark, generous breathing room */
function LockupBeside({ size = 22, markSize = 44, mode = "primary" }) {
  return (
    <div className="fez-lockup-beside">
      <FezMark size={markSize} mode={mode}/>
      <div className="fez-wordmark-text" style={{ fontSize: size }}>
        FILTER ENGINE<span className={`fez-z-${mode}`}>Z</span>
      </div>
    </div>
  );
}

/* Stacked — mark above wordmark (square / portrait contexts) */
function LockupStacked({ markSize = 96, wordSize = 16, mode = "primary" }) {
  return (
    <div className="fez-lockup-stacked">
      <FezMark size={markSize} mode={mode}/>
      <div className="fez-wordmark-text" style={{ fontSize: wordSize, marginTop: 14 }}>
        FILTER ENGINE<span className={`fez-z-${mode}`}>Z</span>
      </div>
    </div>
  );
}

/* Mark-in-circle — for profile/avatar contexts */
function MarkInCircle({ size = 192, mode = "primary" }) {
  const bg = mode === "primary"
    ? "radial-gradient(ellipse at center, #18130F, #0B0A09)"
    : "#E7E2D6";
  const border = mode === "primary" ? "#312E29" : "#BCB6AA";
  // Inset the mark slightly so its rings have breathing room within the circle
  const markScale = 0.78;
  return (
    <div
      className="fez-mark-circle"
      style={{
        width: size, height: size,
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      <FezMark size={Math.round(size * markScale)} mode={mode}/>
    </div>
  );
}

window.FezLockupHorizontal = LockupHorizontal;
window.FezLockupHero       = LockupHero;
window.FezLockupBeside     = LockupBeside;
window.FezLockupStacked    = LockupStacked;
window.FezMarkInCircle     = MarkInCircle;
