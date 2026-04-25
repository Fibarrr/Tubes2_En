import React, { useState, useRef, useCallback, useEffect } from "react";


interface SerializedNode {
  nodeId: string;
  tag: string;
  isTextNode: boolean;
  textContent?: string;
  classes: string[];
  htmlId?: string;
  attributes: Record<string, string>;
  depth: number;
  subtreeSize: number;
  maxDepth: number;
  children: SerializedNode[];
}

interface TraversalStep {
  nodeId: string;
  tag: string;
  depth: number;
  isMatch: boolean;
  stepType: "visit" | "match" | "skip";
}

interface ParseError {
  type: string;
  detail: string;
  pos: number;
}

interface TraverseResponse {
  tree: SerializedNode;
  steps: TraversalStep[];
  matchedNodeIds: string[];
  totalMatches: number;
  nodesVisited: number;
  elapsedMs: number;
  algorithm: string;
  parseErrors: ParseError[];
}

interface NodeState {
  visited: Set<string>;
  matched: Set<string>;
  current: string | null;
}

const API = "http://localhost:5000";

// Helpers 

function flattenTree(node: SerializedNode, result: SerializedNode[] = []) {
  result.push(node);
  node.children.forEach((c) => flattenTree(c, result));
  return result;
}

function nodeLabel(node: SerializedNode) {
  if (node.isTextNode) return `"${(node.textContent ?? "").slice(0, 20)}${(node.textContent ?? "").length > 20 ? "…" : ""}"`;
  let s = node.tag;
  if (node.htmlId) s += `#${node.htmlId}`;
  if (node.classes.length) s += `.${node.classes[0]}`;
  return s;
}

// DOM Tree Graph Renderer 

const NODE_W = 90;
const NODE_H = 36;
const H_GAP  = 18;  // horizontal gap between siblings
const V_GAP  = 52;  // vertical gap between levels

interface LayoutNode {
  node: SerializedNode;
  x: number;
  y: number;
  width: number;
}

function layoutTree(node: SerializedNode, depth: number, xOffset: number): { layouts: LayoutNode[]; totalWidth: number } {
  if (node.children.length === 0) {
    return {
      layouts: [{ node, x: xOffset, y: depth * (NODE_H + V_GAP), width: NODE_W }],
      totalWidth: NODE_W,
    };
  }

  const childLayouts: { layouts: LayoutNode[]; totalWidth: number }[] = [];
  let currentX = xOffset;

  for (const child of node.children) {
    const cl = layoutTree(child, depth + 1, currentX);
    childLayouts.push(cl);
    currentX += cl.totalWidth + H_GAP;
  }

  const totalWidth = currentX - xOffset - H_GAP;
  const firstChildX = childLayouts[0].layouts[0].x;
  const lastChild = childLayouts[childLayouts.length - 1];
  const lastChildX = lastChild.layouts[0].x;
  const centerX = (firstChildX + lastChildX) / 2;

  const allLayouts: LayoutNode[] = [
    { node, x: centerX, y: depth * (NODE_H + V_GAP), width: NODE_W },
    ...childLayouts.flatMap((cl) => cl.layouts),
  ];

  return { layouts: allLayouts, totalWidth };
}

function DomTreeGraph({ root, nodeState, svgRef }: { root: SerializedNode; nodeState: NodeState; svgRef?: React.RefObject<SVGSVGElement> }) {
  const { layouts, totalWidth } = layoutTree(root, 0, 0);
  const layoutMap = new Map<string, LayoutNode>(layouts.map((l) => [l.node.nodeId, l]));
  const maxDepth = root.maxDepth;
  const svgHeight = (maxDepth + 1) * (NODE_H + V_GAP) + 20;
  const svgWidth = Math.max(totalWidth + NODE_W, 600);

  function getNodeColor(node: SerializedNode): { bg: string; border: string; text: string } {
    const id = node.nodeId;
    if (nodeState.matched.has(id))  return { bg: "#16a34a", border: "#15803d", text: "#fff" };
    if (nodeState.current === id)   return { bg: "#d97706", border: "#b45309", text: "#fff" };
    if (nodeState.visited.has(id))  return { bg: "#2563eb", border: "#1d4ed8", text: "#fff" };
    if (node.isTextNode)            return { bg: "#f0fdf4", border: "#86efac", text: "#166534" };
    return { bg: "#1e6b3c", border: "#15803d", text: "#ffffff" };
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "100%" }}>
      <svg ref={svgRef} width={svgWidth} height={svgHeight} style={{ display: "block", minWidth: svgWidth }}>
        {/* Draw edges first (behind nodes) */}
        {layouts.map((layout) => {
          if (!layout.node.children) return null;
          return layout.node.children.map((child) => {
            const childLayout = layoutMap.get(child.nodeId);
            if (!childLayout) return null;
            const x1 = layout.x + NODE_W / 2;
            const y1 = layout.y + NODE_H;
            const x2 = childLayout.x + NODE_W / 2;
            const y2 = childLayout.y;
            const mx = x1;
            const my = (y1 + y2) / 2;
            return (
              <path
                key={`edge-${layout.node.nodeId}-${child.nodeId}`}
                d={`M ${x1} ${y1} C ${mx} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                stroke="#94a3b8"
                strokeWidth={1.5}
                fill="none"
              />
            );
          });
        })}

        {/* Draw nodes */}
        {layouts.map((layout) => {
          const { bg, border, text } = getNodeColor(layout.node);
          const label = nodeLabel(layout.node);
          const isText = layout.node.isTextNode;
          return (
            <g key={layout.node.nodeId} transform={`translate(${layout.x}, ${layout.y})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={isText ? 16 : 6}
                ry={isText ? 16 : 6}
                fill={bg}
                stroke={border}
                strokeWidth={nodeState.current === layout.node.nodeId ? 2.5 : 1.5}
              />
              <text
                x={NODE_W / 2}
                y={NODE_H / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={text}
                fontSize={isText ? 9 : 11}
                fontWeight={nodeState.matched.has(layout.node.nodeId) ? "bold" : "500"}
                fontFamily="'JetBrains Mono', 'Fira Code', monospace"
              >
                {label.length > 11 ? label.slice(0, 10) + "…" : label}
              </text>
              {nodeState.matched.has(layout.node.nodeId) && (
                <text x={NODE_W - 4} y={4} textAnchor="end" dominantBaseline="hanging" fontSize={9} fill="#bbf7d0">✓</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Main App 

export default function App() {
  const [inputMode, setInputMode]     = useState<"url" | "html">("url");
  const [url, setUrl]                 = useState("");
  const [htmlText, setHtmlText]       = useState("");
  const [algorithm, setAlgorithm]     = useState<"BFS" | "DFS">("BFS");
  const [selector, setSelector]       = useState("");
  const [resultMode, setResultMode]   = useState<"all" | "topn">("all");
  const [topN, setTopN]               = useState(5);
  const [activeTab, setActiveTab]     = useState<"tree" | "results" | "log" | "errors">("tree");

  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [response, setResponse]       = useState<TraverseResponse | null>(null);

  const [nodeState, setNodeState]     = useState<NodeState>({ visited: new Set(), matched: new Set(), current: null });
  const [animStep, setAnimStep]       = useState(-1);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [animSpeed, setAnimSpeed]     = useState(80);
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeRef = useRef<SVGSVGElement>(null);

  const QUICK_SELECTORS = ["p", ".box", "#header", "div > p", "a", "h1", "*"];

  // Traversal 

  const runTraversal = useCallback(async () => {
    setLoading(true); setError(null); setResponse(null);
    setNodeState({ visited: new Set(), matched: new Set(), current: null });
    setAnimStep(-1); setIsPlaying(false);
    try {
      const body: Record<string, unknown> = {
        algorithm, cssSelector: selector || "*",
        topN: resultMode === "topn" ? topN : null,
      };
      if (inputMode === "url") body.url = url;
      else body.htmlText = htmlText;

      const res = await fetch(`${API}/traverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setResponse(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [inputMode, url, htmlText, algorithm, selector, resultMode, topN]);

  //  Animation

  const playStep = useCallback((step: number, steps: TraversalStep[]) => {
    if (step >= steps.length) { setIsPlaying(false); setNodeState(p => ({ ...p, current: null })); return; }
    const s = steps[step];
    setAnimStep(step);
    setNodeState(prev => {
      const visited = new Set(prev.visited); const matched = new Set(prev.matched);
      visited.add(s.nodeId);
      if (s.isMatch) matched.add(s.nodeId);
      return { visited, matched, current: s.nodeId };
    });
  }, []);

  useEffect(() => {
    if (!isPlaying || !response) return;
    animRef.current = setTimeout(() => {
      const next = animStep + 1;
      if (next >= response.steps.length) { setIsPlaying(false); setNodeState(p => ({ ...p, current: null })); return; }
      playStep(next, response.steps);
    }, animSpeed);
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, [isPlaying, animStep, response, animSpeed, playStep]);

  const handlePlay = () => {
    if (!response) return;
    if (animStep >= response.steps.length - 1) {
      setNodeState({ visited: new Set(), matched: new Set(), current: null });
      setAnimStep(-1);
      setTimeout(() => setIsPlaying(true), 50);
    } else setIsPlaying(true);
  };

  const handleRevealAll = () => {
    if (!response) return;
    const visited = new Set(response.steps.map(s => s.nodeId));
    const matched = new Set(response.steps.filter(s => s.isMatch).map(s => s.nodeId));
    setNodeState({ visited, matched, current: null });
    setAnimStep(response.steps.length - 1);
    setIsPlaying(false);
  };

  const handleDownloadPng = useCallback(async () => {
    if (!treeRef.current) return;
    try {
      const svg = treeRef.current;
      const svgWidth  = svg.width.baseVal.value;
      const svgHeight = svg.height.baseVal.value;
      const scale = 2; // @2x untuk ketajaman

      // Embed font agar teks tidak hilang saat di-serialize
      const svgClone = svg.cloneNode(true) as SVGSVGElement;
      svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      const svgString = new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url  = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width  = svgWidth  * scale;
        canvas.height = svgHeight * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
        URL.revokeObjectURL(url);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = "dom-tree.png";
        a.click();
      };
      img.src = url;
    } catch (e) {
      console.error("Failed to export PNG:", e);
    }
  }, []);


  const hasResult = !!response;
  const allNodes = response ? flattenTree(response.tree) : [];
  const logEntries = response ? response.steps.slice(0, animStep + 1) : [];

  

  // UI 

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f8fafc", color: "#1e293b", fontFamily: "'Inter','Segoe UI',sans-serif", overflow: "hidden" }}>

      {/* Sidebar */}
      <aside style={{ width: 300, flexShrink: 0, borderRight: "1px solid #e2e8f0", background: "#fff", display: "flex", flexDirection: "column", padding: "20px 16px", gap: 18, overflowY: "auto" }}>

        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", letterSpacing: -0.5 }}>DOM Traversal</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>BFS &amp; DFS · CSS Selector Search</div>
        </div>

        <Divider />

        <Section label="INPUT SOURCE">
          <Toggle2 a="URL" b="HTML text" value={inputMode === "url" ? "URL" : "HTML text"} onChange={v => setInputMode(v === "URL" ? "url" : "html")} />
          {inputMode === "url" ? (
            <><Label>Website URL</Label><SInput placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} /></>
          ) : (
            <><Label>HTML Source</Label>
            <textarea value={htmlText} onChange={e => setHtmlText(e.target.value)} placeholder="<html>...</html>"
              style={{ width:"100%", height:110, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, color:"#1e293b", fontFamily:"monospace", fontSize:12, padding:"8px 10px", resize:"vertical", boxSizing:"border-box" }} /></>
          )}
        </Section>

        <Section label="ALGORITHM">
          <Toggle2 a="BFS" b="DFS" value={algorithm} onChange={v => setAlgorithm(v as "BFS" | "DFS")} />
        </Section>

        <Section label="CSS SELECTOR">
          <SInput placeholder="e.g. div.box / #header / ul > li" value={selector} onChange={e => setSelector(e.target.value)} />
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:4 }}>
            {QUICK_SELECTORS.map(s => <Chip key={s} label={s} onClick={() => setSelector(s)} />)}
          </div>
        </Section>

        <Section label="RESULT COUNT">
          <Toggle2 a="All" b="Top n" value={resultMode === "all" ? "All" : "Top n"} onChange={v => setResultMode(v === "All" ? "all" : "topn")} />
          {resultMode === "topn" && (
            <input type="number" min={1} value={topN} onChange={e => setTopN(parseInt(e.target.value)||1)}
              style={{ marginTop:6, width:"100%", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:6, color:"#1e293b", padding:"6px 10px", fontSize:13, boxSizing:"border-box" }} />
          )}
        </Section>

        <button onClick={runTraversal} disabled={loading} style={{ marginTop:"auto", padding:"11px 0", background: loading ? "#e2e8f0" : "#1e6b3c", color: loading ? "#94a3b8" : "#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor: loading ? "not-allowed":"pointer", transition:"all 0.2s" }}>
          {loading ? "Fetching…" : "Run traversal ↗"}
        </button>

        <button onClick={handleDownloadPng} disabled={!hasResult} style={{ padding:"9px 0", background: !hasResult ? "#f1f5f9" : "#fff", color: !hasResult ? "#cbd5e1" : "#1e6b3c", border: `1px solid ${!hasResult ? "#e2e8f0" : "#1e6b3c"}`, borderRadius:10, fontWeight:600, fontSize:13, cursor: !hasResult ? "not-allowed" : "pointer", transition:"all 0.2s" }}>
          ⬇ Download tree as PNG
        </button>

        {error && (
          <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 12px", fontSize:12, color:"#dc2626" }}>{error}</div>
        )}
      </aside>

      {/*  Main Panel */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ borderBottom:"1px solid #e2e8f0", background:"#fff", padding:"14px 20px", display:"flex", alignItems:"center", gap:16, flexShrink:0 }}>
          {hasResult ? (
            <>
              <Stat label="nodes visited" value={response!.nodesVisited} color="rgb(0, 0, 0)" />
              <Stat label="matches"       value={response!.totalMatches} color="#000000" />
              <Stat label="max depth"     value={response!.tree.maxDepth} color="#000000" />
              <Stat label="time"          value={`${response!.elapsedMs.toFixed(2)}ms`} color="#000000" />
              {response!.parseErrors.length > 0 && (
                <Stat label="parse errors" value={response!.parseErrors.length} color="#dc2626" />
              )}
              <div style={{ marginLeft:"auto", background:"#eff6ff", border:"1px solid #bfdbfe", color:"#1d4ed8", padding:"3px 10px", borderRadius:6, fontSize:12, fontWeight:600 }}>
                {response!.algorithm}
              </div>
            </>
          ) : (
            <span style={{ color:"#94a3b8", fontSize:14 }}>No results yet</span>
          )}

          <div style={{ marginLeft: hasResult ? 16 : "auto", display:"flex", gap:4 }}>
            {(["tree","results","log","errors"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding:"5px 12px", borderRadius:6, border:"1px solid", borderColor: activeTab===tab ? "#cbd5e1":"transparent", background: activeTab===tab ? "#f1f5f9":"transparent", color: activeTab===tab ? "#0f172a":"#94a3b8", fontSize:12, fontWeight:500, cursor:"pointer" }}>
                {tab === "tree" ? "DOM tree" : tab === "log" ? "Traversal log" : tab === "errors" ? `Errors${response?.parseErrors.length ? ` (${response.parseErrors.length})` : ""}` : "Results"}
              </button>
            ))}
          </div>
        </div>

        {/* Animasi */}
        {hasResult && (
          <div style={{ borderBottom:"1px solid #e2e8f0", background:"#f8fafc", padding:"8px 20px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            <span style={{ fontSize:11, color:"#94a3b8" }}>Animation</span>
            <ABtn onClick={() => { setIsPlaying(false); setAnimStep(-1); setNodeState({ visited:new Set(), matched:new Set(), current:null }); }} title="Reset">⟲</ABtn>
            {isPlaying
              ? <ABtn onClick={() => setIsPlaying(false)} title="Pause">⏸</ABtn>
              : <ABtn onClick={handlePlay} title="Play">▶</ABtn>
            }

            <ABtn onClick={handleRevealAll} title="Show all">⏩</ABtn>
            <span style={{ fontSize:11, color:"#94a3b8", marginLeft:6 }}>Speed</span>
            <input type="range" min={10} max={500} value={animSpeed} onChange={e => setAnimSpeed(Number(e.target.value))} style={{ width:70, accentColor:"#1e6b3c" }} />
            <span style={{ fontSize:11, color:"#64748b" }}>Step {Math.max(0,animStep+1)} / {response!.steps.length}</span>
            <div style={{ flex:1, height:3, background:"#e2e8f0", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${((animStep+1)/response!.steps.length)*100}%`, background:"linear-gradient(90deg,#1e6b3c,#16a34a)", transition:"width 0.1s" }} />
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex:1, overflow:"auto", padding:"18px 20px" }}>

          {!hasResult && !loading && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:10, color:"#cbd5e1" }}>
              <div style={{ fontSize:48 }}>⎇</div>
              <div style={{ fontSize:15, fontWeight:600, color:"#94a3b8" }}>DOM tree will appear here</div>
              <div style={{ fontSize:12, color:"#cbd5e1" }}>Enter a URL or HTML and run traversal</div>
            </div>
          )}

          {loading && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12, color:"#94a3b8" }}>
              <div className="spinner" />
              <div style={{ fontSize:14 }}>Fetching and parsing…</div>
            </div>
          )}

          {/* DOM Tree */}
          {hasResult && activeTab === "tree" && (
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:16 }}>
              <div style={{ display:"flex", gap:16, marginBottom:12, flexWrap:"wrap" }}>
                <Legend color="#1e6b3c" label="Element node" />
                <Legend color="#16a34a" label="Match" />
                <Legend color="#d97706" label="Current" />
                <Legend color="#2563eb" label="Visited" />
                <Legend color="#f0fdf4" border="#86efac" textColor="#166534" label="Text node" />
              </div>
              <DomTreeGraph root={response!.tree} nodeState={nodeState} svgRef={treeRef} />
            </div>
          )}

          {/* Hasil */}
          {hasResult && activeTab === "results" && (
            <div>
              <div style={{ fontSize:13, color:"#64748b", marginBottom:12 }}>
                {response!.matchedNodeIds.length} element(s) match{" "}
                <code style={{ background:"#eff6ff", padding:"2px 6px", borderRadius:4, color:"#1d4ed8" }}>{selector||"*"}</code>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {response!.matchedNodeIds.length === 0 && <div style={{ color:"#94a3b8", fontSize:14 }}>No elements matched.</div>}
                {response!.matchedNodeIds.map((id, i) => {
                  const node = allNodes.find(n => n.nodeId === id);
                  return (
                    <div key={id} style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"9px 14px", display:"flex", gap:12, alignItems:"center" }}>
                      <span style={{ fontSize:11, color:"#94a3b8", width:22, textAlign:"right", flexShrink:0 }}>{i+1}</span>
                      <code style={{ color:"#15803d", fontSize:13, fontWeight:600 }}>&lt;{node?.tag ?? id}&gt;</code>
                      {node && <span style={{ fontSize:11, color:"#64748b" }}>depth {node.depth}{node.classes.length > 0 ? ` · .${node.classes.join(".")}`:""}{node.htmlId ? ` · #${node.htmlId}`:""}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Traversal Log */}
          {hasResult && activeTab === "log" && (
            <div>
              <div style={{ fontSize:13, color:"#4a5361", marginBottom:12 }}>
                Traversal log · {response!.algorithm} · {logEntries.length} / {response!.steps.length} steps shown
              </div>
              <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"#f8fafc" }}>
                      <Th>#</Th><Th>Tag</Th><Th>Node ID</Th><Th>Depth</Th><Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {logEntries.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign:"center", padding:24, color:"#626c7a" }}>Press ▶ to start or ⏩ to skip</td></tr>
                    )}
                    {logEntries.map((step, i) => (
                      <tr key={i} style={{ borderTop:"1px solid #f1f5f9", background: step.isMatch ? "#f0fdf4" : i%2===0?"#fff":"#fafafa" }}>
                        <Td>{i+1}</Td>
                        <Td><code style={{ color: step.isMatch?"#15803c":"#475569" }}>&lt;{step.tag}&gt;</code></Td>
                        <Td style={{ color:"#94a3b8" }}>{step.nodeId}</Td>
                        <Td>{step.depth}</Td>
                        <Td><span style={{ color: step.isMatch?"#15803d":"#94a3b8", fontWeight: step.isMatch?600:400 }}>{step.isMatch?"✓ match":"visited"}</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Errors */}
          {hasResult && activeTab === "errors" && (
            <div>
              <div style={{ fontSize:13, color:"#64748b", marginBottom:12 }}>
                {response!.parseErrors.length === 0 ? "Tidak ada parse error ditemukan ✓" : `${response!.parseErrors.length} parse error ditemukan`}
              </div>
              {response!.parseErrors.length === 0 && (
                <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"20px 16px", textAlign:"center", color:"#15803d", fontSize:14 }}>
                  HTML valid, tidak ada error struktural
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {response!.parseErrors.map((err, i) => (
                  <div key={i} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, background:"#dc2626", color:"#fff", padding:"2px 7px", borderRadius:4 }}>{err.type}</span>
                      <span style={{ fontSize:11, color:"#94a3b8" }}>pos {err.pos}</span>
                    </div>
                    <div style={{ fontSize:12, color:"#991b1b" }}>{err.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
        .spinner { width:32px; height:32px; border:3px solid #e2e8f0; border-top-color:#1e6b3c; border-radius:50%; animation:spin 0.8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}



function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.2, color:"#94a3b8", marginBottom:7, textTransform:"uppercase" }}>{label}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:12, color:"#64748b" }}>{children}</div>;
}

function Divider() {
  return <hr style={{ border:"none", borderTop:"1px solid #f1f5f9" }} />;
}

function SInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ width:"100%", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, color:"#1e293b", padding:"7px 11px", fontSize:13, outline:"none", ...props.style }} />
  );
}

function Toggle2({ a, b, value, onChange }: { a:string; b:string; value:string; onChange:(v:string)=>void }) {
  return (
    <div style={{ display:"flex", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
      {[a,b].map(opt => (
        <button key={opt} onClick={() => onChange(opt)} style={{ flex:1, padding:"7px 0", border:"none", background: value===opt?"#fff":"transparent", color: value===opt?"#0f172a":"#94a3b8", fontWeight: value===opt?700:400, fontSize:13, cursor:"pointer", boxShadow: value===opt?"0 1px 3px rgba(0,0,0,0.08)":"none", transition:"all 0.15s" }}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function Chip({ label, onClick }: { label:string; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{ padding:"3px 8px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:12, color:"#64748b", fontSize:11, cursor:"pointer", fontFamily:"monospace" }}>
      {label}
    </button>
  );
}

function Stat({ label, value, color }: { label:string; value:string|number; color:string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
      <div style={{ fontSize:18, fontWeight:700, color, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>
    </div>
  );
}

function Legend({ color, label, border, textColor }: { color:string; label:string; border?:string; textColor?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      <div style={{ width:14, height:14, borderRadius:3, background:color, border: border ? `1px solid ${border}` : "none" }} />
      <span style={{ fontSize:11, color: textColor ?? "#64748b" }}>{label}</span>
    </div>
  );
}

function ABtn({ children, onClick, title }: { children:React.ReactNode; onClick:()=>void; title?:string }) {
  return (
    <button onClick={onClick} title={title} style={{ padding:"4px 9px", background:"#fff", border:"1px solid #e2e8f0", borderRadius:6, color:"#475569", fontSize:13, cursor:"pointer" }}>
      {children}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding:"7px 12px", textAlign:"left", color:"#94a3b8", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:0.5, borderBottom:"1px solid #e2e8f0" }}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding:"6px 12px", color:"#64748b", ...style }}>{children}</td>;
}