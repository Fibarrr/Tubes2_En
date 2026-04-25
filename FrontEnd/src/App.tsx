import React, { useState, useRef, useCallback, useEffect } from "react";

// Types 

interface SerializedNode {
  nodeId: string;
  tag: string;
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

interface TraverseResponse {
  tree: SerializedNode;
  steps: TraversalStep[];
  matchedNodeIds: string[];
  totalMatches: number;
  nodesVisited: number;
  elapsedMs: number;
  algorithm: string;
}

// Config 

const API = "http://localhost:5000";

// Helpers 

function flattenTree(node: SerializedNode, result: SerializedNode[] = []) {
  result.push(node);
  node.children.forEach((c) => flattenTree(c, result));
  return result;
}

function nodeLabel(node: SerializedNode) {
  let s = `<${node.tag}`;
  if (node.htmlId) s += `#${node.htmlId}`;
  if (node.classes.length) s += `.${node.classes[0]}`;
  return s + ">";
}

// Tree Renderer

interface NodeState {
  visited: Set<string>;
  matched: Set<string>;
  current: string | null;
}

function TreeNodeComponent({
  node,
  nodeState,
  depth = 0,
  isLast = false,
  prefix = "",
}: {
  node: SerializedNode;
  nodeState: NodeState;
  depth?: number;
  isLast?: boolean;
  prefix?: string;
}) {
  const isVisited = nodeState.visited.has(node.nodeId);
  const isMatched = nodeState.matched.has(node.nodeId);
  const isCurrent = nodeState.current === node.nodeId;

  const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
  const childPrefix = prefix + (depth === 0 ? "" : isLast ? "   " : "│  ");

  const tagColor = isMatched
    ? "#4ade80"
    : isCurrent
    ? "#facc15"
    : isVisited
    ? "#60a5fa"
    : "#94a3b8";

  const bgColor = isMatched
    ? "rgba(74,222,128,0.08)"
    : isCurrent
    ? "rgba(250,204,21,0.1)"
    : isVisited
    ? "rgba(96,165,250,0.06)"
    : "transparent";

  const borderLeft = isCurrent
    ? "2px solid #facc15"
    : isMatched
    ? "2px solid #4ade80"
    : "2px solid transparent";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "1px 4px",
          background: bgColor,
          borderLeft,
          transition: "all 0.25s ease",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 12,
          lineHeight: "20px",
          whiteSpace: "pre",
        }}
      >
        <span style={{ color: "#475569", userSelect: "none" }}>
          {prefix + connector}
        </span>
        <span
          style={{
            color: tagColor,
            fontWeight: isMatched || isCurrent ? 700 : 400,
            transition: "color 0.25s ease",
          }}
        >
          {nodeLabel(node)}
        </span>
        {isCurrent && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              color: "#facc15",
              background: "rgba(250,204,21,0.15)",
              padding: "0 5px",
              borderRadius: 3,
            }}
          >
            scanning
          </span>
        )}
        {isMatched && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              color: "#4ade80",
              background: "rgba(74,222,128,0.15)",
              padding: "0 5px",
              borderRadius: 3,
            }}
          >
            ✓ match
          </span>
        )}
      </div>
      {node.children.map((child, i) => (
        <TreeNodeComponent
          key={child.nodeId}
          node={child}
          nodeState={nodeState}
          depth={depth + 1}
          isLast={i === node.children.length - 1}
          prefix={childPrefix}
        />
      ))}
    </div>
  );
}

// Main App

export default function App() {
  const [inputMode, setInputMode] = useState<"url" | "html">("url");
  const [url, setUrl] = useState("");
  const [htmlText, setHtmlText] = useState("");
  const [algorithm, setAlgorithm] = useState<"BFS" | "DFS">("BFS");
  const [selector, setSelector] = useState("");
  const [resultMode, setResultMode] = useState<"all" | "topn">("all");
  const [topN, setTopN] = useState(5);
  const [activeTab, setActiveTab] = useState<"tree" | "results" | "log">("tree");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<TraverseResponse | null>(null);

  // Animation state
  const [nodeState, setNodeState] = useState<NodeState>({
    visited: new Set(),
    matched: new Set(),
    current: null,
  });
  const [animStep, setAnimStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(80); // ms per step
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const QUICK_SELECTORS = ["p", ".box", "#header", "div > p", "a", "*"];

  // Run traversal 

  const runTraversal = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setNodeState({ visited: new Set(), matched: new Set(), current: null });
    setAnimStep(-1);
    setIsPlaying(false);

    try {
      const body: Record<string, unknown> = {
        algorithm,
        cssSelector: selector || "*",
        topN: resultMode === "topn" ? topN : null,
      };
      if (inputMode === "url") body.url = url;
      else body.htmlText = htmlText;

      const res = await fetch(`${API}/traverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }

      const data: TraverseResponse = await res.json();
      setResponse(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [inputMode, url, htmlText, algorithm, selector, resultMode, topN]);

  // Animation controls 

  const playStep = useCallback(
    (step: number, steps: TraversalStep[]) => {
      if (step >= steps.length) {
        setIsPlaying(false);
        setNodeState((prev) => ({ ...prev, current: null }));
        return;
      }
      const s = steps[step];
      setAnimStep(step);
      setNodeState((prev) => {
        const visited = new Set(prev.visited);
        const matched = new Set(prev.matched);
        visited.add(s.nodeId);
        if (s.isMatch) matched.add(s.nodeId);
        return { visited, matched, current: s.nodeId };
      });
    },
    []
  );

  useEffect(() => {
    if (!isPlaying || !response) return;
    animRef.current = setTimeout(() => {
      const next = animStep + 1;
      if (next >= response.steps.length) {
        setIsPlaying(false);
        setNodeState((prev) => ({ ...prev, current: null }));
        return;
      }
      playStep(next, response.steps);
    }, animSpeed);
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, [isPlaying, animStep, response, animSpeed, playStep]);

  const handlePlay = () => {
    if (!response) return;
    if (animStep >= response.steps.length - 1) {
      // Restart
      setNodeState({ visited: new Set(), matched: new Set(), current: null });
      setAnimStep(-1);
      setTimeout(() => setIsPlaying(true), 50);
    } else {
      setIsPlaying(true);
    }
  };

  const handlePause = () => setIsPlaying(false);

  const handleReset = () => {
    setIsPlaying(false);
    setAnimStep(-1);
    setNodeState({ visited: new Set(), matched: new Set(), current: null });
  };

  const handleStepForward = () => {
    if (!response) return;
    const next = animStep + 1;
    if (next < response.steps.length) {
      playStep(next, response.steps);
    }
  };

  const handleRevealAll = () => {
    if (!response) return;
    const visited = new Set(response.steps.map((s) => s.nodeId));
    const matched = new Set(
      response.steps.filter((s) => s.isMatch).map((s) => s.nodeId)
    );
    setNodeState({ visited, matched, current: null });
    setAnimStep(response.steps.length - 1);
    setIsPlaying(false);
  };

  // Layout

  const hasResult = !!response;
  const maxDepth = response ? response.tree.maxDepth : null;
  const allNodes = response ? flattenTree(response.tree) : [];

  const logEntries = response ? response.steps.slice(0, animStep + 1) : [];

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0f1117",
        color: "#e2e8f0",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          padding: "24px 20px",
          gap: 20,
          overflowY: "auto",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
            DOM Traversal
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            BFS &amp; DFS · CSS Selector Search
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #1e293b" }} />

        <Section label="INPUT SOURCE">
          <TogglePair
            a="URL"
            b="HTML text"
            value={inputMode === "url" ? "URL" : "HTML text"}
            onChange={(v) => setInputMode(v === "URL" ? "url" : "html")}
          />
          {inputMode === "url" ? (
            <>
              <Label>Website URL</Label>
              <Input
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </>
          ) : (
            <>
              <Label>HTML Source</Label>
              <textarea
                value={htmlText}
                onChange={(e) => setHtmlText(e.target.value)}
                placeholder="<html>...</html>"
                style={{
                  width: "100%",
                  height: 120,
                  background: "#0d1117",
                  border: "1px solid #1e293b",
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: "8px 10px",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </>
          )}
        </Section>

        <Section label="ALGORITHM">
          <TogglePair
            a="BFS"
            b="DFS"
            value={algorithm}
            onChange={(v) => setAlgorithm(v as "BFS" | "DFS")}
          />
        </Section>

        <Section label="CSS SELECTOR">
          <Input
            placeholder="e.g. div.box / #header / ul > li"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {QUICK_SELECTORS.map((s) => (
              <Chip key={s} label={s} onClick={() => setSelector(s)} />
            ))}
          </div>
        </Section>

        <Section label="RESULT COUNT">
          <TogglePair
            a="All"
            b="Top n"
            value={resultMode === "all" ? "All" : "Top n"}
            onChange={(v) => setResultMode(v === "All" ? "all" : "topn")}
          />
          {resultMode === "topn" && (
            <input
              type="number"
              min={1}
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value) || 1)}
              style={{
                marginTop: 8,
                width: "100%",
                background: "#0d1117",
                border: "1px solid #1e293b",
                borderRadius: 6,
                color: "#e2e8f0",
                padding: "6px 10px",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          )}
        </Section>

        <button
          onClick={runTraversal}
          disabled={loading}
          style={{
            marginTop: "auto",
            padding: "12px 0",
            background: loading ? "#1e293b" : "#e2e8f0",
            color: loading ? "#64748b" : "#0f1117",
            border: "none",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            letterSpacing: 0.2,
            transition: "all 0.2s",
          }}
        >
          {loading ? "Fetching…" : "Run traversal ↗"}
        </button>

        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}
      </aside>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            borderBottom: "1px solid #1e293b",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexShrink: 0,
          }}
        >
          {hasResult ? (
            <>
              <StatBadge
                label="nodes visited"
                value={response!.nodesVisited}
                color="#60a5fa"
              />
              <StatBadge
                label="matches"
                value={response!.totalMatches}
                color="#4ade80"
              />
              <StatBadge
                label="max depth"
                value={maxDepth ?? 0}
                color="#a78bfa"
              />
              <StatBadge
                label="time"
                value={`${response!.elapsedMs.toFixed(2)}ms`}
                color="#f59e0b"
              />
              <div
                style={{
                  marginLeft: "auto",
                  background: "rgba(99,102,241,0.15)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  color: "#818cf8",
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {response!.algorithm}
              </div>
            </>
          ) : (
            <span style={{ color: "#475569", fontSize: 14 }}>No results yet</span>
          )}

          <div style={{ marginLeft: hasResult ? 16 : "auto", display: "flex", gap: 4 }}>
            {(["tree", "results", "log"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: activeTab === tab ? "#334155" : "transparent",
                  background: activeTab === tab ? "#1e293b" : "transparent",
                  color: activeTab === tab ? "#e2e8f0" : "#64748b",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {tab === "tree" ? "DOM tree" : tab === "log" ? "Traversal log" : "Results"}
              </button>
            ))}
          </div>
        </div>

        {hasResult && (
          <div
            style={{
              borderBottom: "1px solid #1e293b",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
              background: "#0d1117",
            }}
          >
            <span style={{ fontSize: 12, color: "#64748b", marginRight: 4 }}>
              Animation
            </span>
            <AnimBtn onClick={handleReset} title="Reset">⟲</AnimBtn>
            {isPlaying ? (
              <AnimBtn onClick={handlePause} title="Pause">⏸</AnimBtn>
            ) : (
              <AnimBtn onClick={handlePlay} title="Play">▶</AnimBtn>
            )}
            <AnimBtn onClick={handleStepForward} title="Step">⏭</AnimBtn>
            <AnimBtn onClick={handleRevealAll} title="Show all">⏩</AnimBtn>
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>Speed</span>
            <input
              type="range"
              min={10}
              max={500}
              value={animSpeed}
              onChange={(e) => setAnimSpeed(Number(e.target.value))}
              style={{ width: 80, accentColor: "#60a5fa" }}
            />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Step {Math.max(0, animStep + 1)} / {response!.steps.length}
            </span>
            <div
              style={{
                flex: 1,
                height: 3,
                background: "#1e293b",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${((animStep + 1) / response!.steps.length) * 100}%`,
                  background: "linear-gradient(90deg, #60a5fa, #4ade80)",
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {!hasResult && !loading && (
            <EmptyState />
          )}

          {loading && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 12,
                color: "#475569",
              }}
            >
              <div className="spinner" />
              <div style={{ fontSize: 14 }}>Fetching and parsing…</div>
            </div>
          )}

          {hasResult && activeTab === "tree" && (
            <div
              style={{
                background: "#0d1117",
                border: "1px solid #1e293b",
                borderRadius: 10,
                padding: "16px 12px",
                fontFamily: "monospace",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#475569",
                  marginBottom: 10,
                  display: "flex",
                  gap: 16,
                }}
              >
                <Legend color="#4ade80" label="Match" />
                <Legend color="#facc15" label="Current" />
                <Legend color="#60a5fa" label="Visited" />
                <Legend color="#94a3b8" label="Unvisited" />
              </div>
              <TreeNodeComponent node={response!.tree} nodeState={nodeState} />
            </div>
          )}

          {hasResult && activeTab === "results" && (
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  marginBottom: 12,
                }}
              >
                {response!.matchedNodeIds.length} element(s) match{" "}
                <code
                  style={{
                    background: "#1e293b",
                    padding: "2px 6px",
                    borderRadius: 4,
                    color: "#818cf8",
                  }}
                >
                  {selector || "*"}
                </code>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {response!.matchedNodeIds.length === 0 && (
                  <div style={{ color: "#475569", fontSize: 14 }}>
                    No elements matched.
                  </div>
                )}
                {response!.matchedNodeIds.map((id, i) => {
                  const node = allNodes.find((n) => n.nodeId === id);
                  return (
                    <div
                      key={id}
                      style={{
                        background: "#0d1117",
                        border: "1px solid rgba(74,222,128,0.2)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: "#475569",
                          width: 24,
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <code style={{ color: "#4ade80", fontSize: 13 }}>
                        {node ? nodeLabel(node) : id}
                      </code>
                      {node && (
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          depth {node.depth}
                          {node.classes.length > 0 && ` · .${node.classes.join(".")}`}
                          {node.htmlId && ` · #${node.htmlId}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasResult && activeTab === "log" && (
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  marginBottom: 12,
                }}
              >
                Traversal log · {response!.algorithm} ·{" "}
                {logEntries.length} / {response!.steps.length} steps shown
              </div>
              <div
                style={{
                  background: "#0d1117",
                  border: "1px solid #1e293b",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#1e293b" }}>
                      <Th>#</Th>
                      <Th>Tag</Th>
                      <Th>Node ID</Th>
                      <Th>Depth</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {logEntries.map((step, i) => (
                      <tr
                        key={i}
                        style={{
                          borderTop: "1px solid #1e293b",
                          background:
                            step.isMatch
                              ? "rgba(74,222,128,0.05)"
                              : i % 2 === 0
                              ? "transparent"
                              : "rgba(255,255,255,0.01)",
                        }}
                      >
                        <Td>{i + 1}</Td>
                        <Td>
                          <code style={{ color: step.isMatch ? "#4ade80" : "#94a3b8" }}>
                            &lt;{step.tag}&gt;
                          </code>
                        </Td>
                        <Td style={{ color: "#475569" }}>{step.nodeId}</Td>
                        <Td>{step.depth}</Td>
                        <Td>
                          <span
                            style={{
                              color: step.isMatch ? "#4ade80" : "#64748b",
                              fontWeight: step.isMatch ? 600 : 400,
                            }}
                          >
                            {step.isMatch ? "✓ match" : "visited"}
                          </span>
                        </Td>
                      </tr>
                    ))}
                    {logEntries.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: 24,
                            color: "#475569",
                          }}
                        >
                          Press ▶ to start animation, or ⏩ to reveal all
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f1117; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        .spinner {
          width: 32px; height: 32px;
          border: 3px solid #1e293b;
          border-top-color: #60a5fa;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}


function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: "#475569",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "#94a3b8" }}>{children}</div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        background: "#0d1117",
        border: "1px solid #1e293b",
        borderRadius: 8,
        color: "#e2e8f0",
        padding: "8px 12px",
        fontSize: 13,
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function TogglePair({
  a,
  b,
  value,
  onChange,
}: {
  a: string;
  b: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "#0d1117",
        border: "1px solid #1e293b",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {[a, b].map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            flex: 1,
            padding: "8px 0",
            border: "none",
            background: value === opt ? "#1e293b" : "transparent",
            color: value === opt ? "#e2e8f0" : "#64748b",
            fontWeight: value === opt ? 700 : 400,
            fontSize: 13,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 9px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 12,
        color: "#94a3b8",
        fontSize: 11,
        cursor: "pointer",
        fontFamily: "monospace",
      }}
    >
      {label}
    </button>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
    </div>
  );
}

function AnimBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 10px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 6,
        color: "#94a3b8",
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 12,
        color: "#334155",
      }}
    >
      <div style={{ fontSize: 48 }}>⎇</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#475569" }}>
        DOM tree will appear here
      </div>
      <div style={{ fontSize: 13, color: "#334155" }}>
        Enter a URL or HTML and run traversal
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: "left",
        color: "#64748b",
        fontWeight: 600,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <td style={{ padding: "7px 12px", color: "#94a3b8", ...style }}>
      {children}
    </td>
  );
}