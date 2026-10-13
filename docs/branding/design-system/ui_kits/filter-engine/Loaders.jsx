/* global React */

/* ============================================================================
   Filter Engine UI Kit — small inline loaders
   Acid theme, scoped via CSS classes prefixed `fe-l-`
   ============================================================================ */

function SynapticOrbit({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: "block" }}>
      <g className="fe-l-a-rotate">
        <circle className="fe-l-a-ring" cx="100" cy="100" r="78"/>
        <circle className="fe-l-a-ring" cx="100" cy="100" r="55"/>
        <circle className="fe-l-a-ring" cx="100" cy="100" r="34"/>
        <circle className="fe-l-a-sat-glow" cx="178" cy="100" r="3.5" style={{ animationDelay: "0s" }}/>
        <circle className="fe-l-a-sat" cx="61" cy="167.6" r="3"/>
        <circle className="fe-l-a-sat-glow" cx="61" cy="32.4" r="3.5" style={{ animationDelay: "0.5s" }}/>
        <circle className="fe-l-a-sat" cx="127.5" cy="52.4" r="3"/>
        <circle className="fe-l-a-sat-glow" cx="72.5" cy="147.6" r="3.5" style={{ animationDelay: "0.2s" }}/>
        <circle className="fe-l-a-sat" cx="134" cy="100" r="2.5"/>
        <circle className="fe-l-a-sat" cx="83" cy="129.4" r="2.5"/>
        <circle className="fe-l-a-sat-glow" cx="83" cy="70.6" r="3" style={{ animationDelay: "0.7s" }}/>
        <line className="fe-l-a-syn fe-l-a-syn-1" x1="178" y1="100" x2="127.5" y2="52.4"/>
        <line className="fe-l-a-syn fe-l-a-syn-2" x1="127.5" y1="52.4" x2="61" y2="32.4"/>
        <line className="fe-l-a-syn fe-l-a-syn-3" x1="72.5" y1="147.6" x2="61" y2="167.6"/>
        <line className="fe-l-a-syn fe-l-a-syn-4" x1="83" y1="70.6" x2="134" y2="100"/>
        <line className="fe-l-a-syn fe-l-a-syn-5" x1="178" y1="100" x2="134" y2="100"/>
        <line className="fe-l-a-syn fe-l-a-syn-6" x1="83" y1="129.4" x2="72.5" y2="147.6"/>
      </g>
      <circle className="fe-l-a-core" cx="100" cy="100" r="5"/>
    </svg>
  );
}

function NeuralCluster({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: "block" }}>
      <g className="fe-l-b-rotate">
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="62" y1="58"  x2="88" y2="42"  style={{ animationDelay: "0.0s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="88" y1="42"  x2="125" y2="50" style={{ animationDelay: "0.3s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="125" y1="50" x2="148" y2="76" style={{ animationDelay: "0.5s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="148" y1="76" x2="155" y2="112" style={{ animationDelay: "0.8s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="155" y1="112" x2="140" y2="148" style={{ animationDelay: "1.0s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="140" y1="148" x2="108" y2="160" style={{ animationDelay: "1.3s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="108" y1="160" x2="72" y2="152" style={{ animationDelay: "1.5s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="72" y1="152" x2="48" y2="122" style={{ animationDelay: "1.8s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="48" y1="122" x2="45" y2="88" style={{ animationDelay: "2.0s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="45" y1="88" x2="62" y2="58" style={{ animationDelay: "2.3s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="100" y1="92" x2="148" y2="76" style={{ animationDelay: "0.7s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="100" y1="92" x2="48" y2="122" style={{ animationDelay: "1.9s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="100" y1="92" x2="62" y2="58" style={{ animationDelay: "2.4s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="100" y1="92" x2="72" y2="118" style={{ animationDelay: "0.2s" }}/>
        <line className="fe-l-b-edge fe-l-b-edge-pulse" x1="100" y1="92" x2="118" y2="130" style={{ animationDelay: "1.6s" }}/>
        <circle className="fe-l-b-node-fire" cx="62" cy="58" r="3" style={{ animationDelay: "0s" }}/>
        <circle className="fe-l-b-node" cx="88" cy="42" r="2.5"/>
        <circle className="fe-l-b-node-fire" cx="125" cy="50" r="3" style={{ animationDelay: "0.9s" }}/>
        <circle className="fe-l-b-node" cx="148" cy="76" r="2.5"/>
        <circle className="fe-l-b-node-fire" cx="155" cy="112" r="3" style={{ animationDelay: "0.3s" }}/>
        <circle className="fe-l-b-node" cx="140" cy="148" r="2.5"/>
        <circle className="fe-l-b-node-fire" cx="108" cy="160" r="3" style={{ animationDelay: "1.4s" }}/>
        <circle className="fe-l-b-node" cx="72" cy="152" r="2.5"/>
        <circle className="fe-l-b-node-fire" cx="48" cy="122" r="3" style={{ animationDelay: "0.6s" }}/>
        <circle className="fe-l-b-node" cx="45" cy="88" r="2.5"/>
        <circle className="fe-l-b-node" cx="72" cy="118" r="2.5"/>
        <circle className="fe-l-b-node" cx="118" cy="130" r="2.5"/>
        <circle className="fe-l-b-node-fire" cx="100" cy="92" r="4" style={{ animationDelay: "1.7s" }}/>
      </g>
    </svg>
  );
}

window.FESynapticOrbit = SynapticOrbit;
window.FENeuralCluster = NeuralCluster;
