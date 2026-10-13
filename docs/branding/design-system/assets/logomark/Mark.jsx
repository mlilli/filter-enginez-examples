/* global React */

/* ============================================================================
   FilterEngineZ — Canonical Mark
   - Geometry: three crescent arcs at offset angles
   - Asymmetric chamfer: 7u baseline, 10u flare on the right side
     · cLeft = 7u  (diag meets bottom bar at the left)
     · cRight = 10u (diag meets top bar at the right)
     · bTL = 7u    (TL upper-outer terminal bevel)
     · bBR = 10u   (BR lower-outer terminal bevel)
   - Translucent Z: 70% opacity fill + 1.6u solid outline
   - Synapse node at center · gentle breathing animation (2.4s ease-in-out)
   - Two modes: primary (cyan + neon) · subdued (outline-only, no glow)
   ============================================================================ */

const CM_ACCENT     = "#22D3EE";
const CM_GLOW       = "#67E8F9";
const CM_GLOW_DEEP  = "#0EA5C7";
const CM_RING       = "#605C53";
const CM_INNER_RING = "#7C7669";
const CM_MONO       = "#56524A";
const CM_MONO_DK    = "#3A3731";
const CM_MONO_INNER = "#56524A";

/* The CANONICAL Z path geometry. Single source of truth. */
function buildCanonicalZ() {
  const cLeft = 7;
  const cRight = 10;
  const bTL = 7;
  const bBR = 10;

  const topBar =
    `M ${14 + bTL} 14 ` +
    `L 86 14 ` +
    `L 86 24 ` +
    `L 22 24 ` +
    `L 14 24 ` +
    `L 14 ${14 + bTL} ` +
    `Z`;

  const diag =
    `M 86 24 ` +
    `L 86 ${24 + cRight} ` +
    `L ${30 - cLeft} 76 ` +
    `L 22 76 ` +
    `L 22 ${76 - cLeft} ` +
    `L ${78 + cRight - cRight} 24 ` +    // 78 (we don't add cRight here, just the right edge chamfer is the (24+cRight) above)
    `L ${78 + cRight} 24 ` +
    `Z`;

  // Cleaner re-derivation of diag with both chamfers separate:
  //   Start at (86, 24) → vertical down to (86, 24+cRight)
  //   Diagonal SW to (30-cLeft, 76)
  //   Horizontal left to (22, 76)
  //   Vertical up to (22, 76-cLeft)
  //   Diagonal NE back to (78+cRight, 24)
  //   Horizontal right back to (86, 24)
  const diagClean =
    `M 86 24 ` +
    `L 86 ${24 + cRight} ` +
    `L ${30 - cLeft} 76 ` +
    `L 22 76 ` +
    `L 22 ${76 - cLeft} ` +
    `L ${78 + cRight} 24 ` +
    `Z`;

  const botBar =
    `M 14 76 ` +
    `L 78 76 ` +
    `L 86 76 ` +
    `L 86 ${86 - bBR} ` +
    `L ${86 - bBR} 86 ` +
    `L 14 86 ` +
    `Z`;

  return { topBar, diag: diagClean, botBar };
}

const Z_PATHS = buildCanonicalZ();

function describeArc(cx, cy, r, startAng, endAng) {
  const toRad = (a) => (a - 90) * Math.PI / 180;
  const sx = cx + r * Math.cos(toRad(startAng));
  const sy = cy + r * Math.sin(toRad(startAng));
  const ex = cx + r * Math.cos(toRad(endAng));
  const ey = cy + r * Math.sin(toRad(endAng));
  const sweep = endAng - startAng;
  const large = sweep > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

/* The three crescent arcs */
const ARC_OUTER  = describeArc(50, 50, 42, 30, 210);
const ARC_MIDDLE = describeArc(50, 50, 29, 150, 330);
const ARC_INNER  = describeArc(50, 50, 16, -90, 90);

/* ============================================================================
   The Z block — adapts to size & mode
   ============================================================================ */
function CanonicalZBlock({ mode = "primary", smallFavicon = false, glowScale = 1 }) {
  if (mode === "subdued") {
    return (
      <g>
        <path d={Z_PATHS.topBar} fill="none" stroke={CM_MONO} strokeWidth={smallFavicon ? 2.4 : 1.8} strokeLinejoin="miter"/>
        <path d={Z_PATHS.diag}   fill="none" stroke={CM_MONO} strokeWidth={smallFavicon ? 2.4 : 1.8} strokeLinejoin="miter"/>
        <path d={Z_PATHS.botBar} fill="none" stroke={CM_MONO} strokeWidth={smallFavicon ? 2.4 : 1.8} strokeLinejoin="miter"/>
      </g>
    );
  }
  return (
    <g
      style={{
        filter: smallFavicon
          ? undefined
          : `drop-shadow(0 0 ${1.2 * glowScale}px ${CM_GLOW}) drop-shadow(0 0 ${5 * glowScale}px ${CM_GLOW_DEEP})`,
      }}
    >
      <path d={Z_PATHS.topBar} fill={CM_ACCENT} opacity={smallFavicon ? 1 : 0.7}/>
      <path d={Z_PATHS.diag}   fill={CM_ACCENT} opacity={smallFavicon ? 1 : 0.7}/>
      <path d={Z_PATHS.botBar} fill={CM_ACCENT} opacity={smallFavicon ? 1 : 0.7}/>
      {!smallFavicon && (
        <>
          <path d={Z_PATHS.topBar} fill="none" stroke={CM_ACCENT} strokeWidth={1.6} strokeLinejoin="miter"/>
          <path d={Z_PATHS.diag}   fill="none" stroke={CM_ACCENT} strokeWidth={1.6} strokeLinejoin="miter"/>
          <path d={Z_PATHS.botBar} fill="none" stroke={CM_ACCENT} strokeWidth={1.6} strokeLinejoin="miter"/>
        </>
      )}
    </g>
  );
}

/* ============================================================================
   Synapse node — gentle breathing animation (locked)
   ============================================================================ */
function CanonicalSynapse({ mode = "primary", animated = false, r = 3.2 }) {
  if (mode === "subdued") {
    return <circle cx="50" cy="50" r={r} fill="none" stroke={CM_MONO} strokeWidth="1.4"/>;
  }
  return (
    <g
      className={animated ? "fez-synapse-breathe" : ""}
      style={{
        filter: `drop-shadow(0 0 2px ${CM_GLOW}) drop-shadow(0 0 6px ${CM_GLOW})`,
        transformOrigin: "50px 50px",
      }}
    >
      <circle cx="50" cy="50" r={r} fill={CM_GLOW}/>
      <circle cx="50" cy="50" r={r * 0.5} fill="#F1ECDF"/>
    </g>
  );
}

/* ============================================================================
   Canonical mark — exported for use in all lockups
   ============================================================================ */
function FezMark({ size = 200, mode = "primary", noRings = false, animated = false }) {
  const microFavicon = size <= 12;
  const smallFavicon = size <= 16;
  const glowScale = Math.max(0.4, Math.min(1.2, size / 200));
  const isPrimary = mode === "primary";
  const ringStroke  = isPrimary ? CM_RING        : CM_MONO_DK;
  const innerStroke = isPrimary ? CM_INNER_RING  : CM_MONO_INNER;
  const sw  = smallFavicon ? 2   : 1.8;
  const swi = smallFavicon ? 2.4 : 2;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
         xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      {!noRings && !microFavicon && (
        <>
          <path d={ARC_OUTER}  fill="none" stroke={ringStroke}  strokeWidth={sw}  strokeLinecap="round"/>
          <path d={ARC_MIDDLE} fill="none" stroke={ringStroke}  strokeWidth={sw}  strokeLinecap="round"/>
          <path d={ARC_INNER}  fill="none" stroke={innerStroke} strokeWidth={swi} strokeLinecap="round"/>
        </>
      )}
      <CanonicalZBlock mode={mode} smallFavicon={smallFavicon} glowScale={glowScale}/>
      {!noRings && !smallFavicon && <CanonicalSynapse mode={mode} animated={animated}/>}
    </svg>
  );
}

window.FezMark = FezMark;
window.FEZ_Z_PATHS = Z_PATHS;
window.FEZ_ARCS = { ARC_OUTER, ARC_MIDDLE, ARC_INNER };
