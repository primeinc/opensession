"use client";

import { useQueryState, parseAsString, parseAsBoolean } from "nuqs";
import { useEffect, useState, useCallback, useRef } from "react";

interface Project {
  id: string;
  name?: string;
  worktree?: string;
  time?: { updated?: number };
}

interface Session {
  id: string;
  projectID: string;
  title: string;
  directory?: string;
  time?: { created?: number; updated?: number };
}

interface Part {
  id: string;
  type: string;
  text?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: any;
    output?: string;
    error?: string;
    title?: string;
    metadata?: {
      summary?: Part[];
    };
  };
}

interface Message {
  id: string;
  role: string;
  providerID?: string;
  modelID?: string;
  path?: { cwd?: string };
}

interface SearchResult {
  type: "project" | "session" | "content";
  project?: Project;
  session?: Session;
  sessionId?: string;
  projectId?: string;
  match: string;
  role?: string;
  tool?: string;
}

function formatRelativeTime(ts?: number) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function getProjectName(p: Project) {
  return p.name || p.worktree?.split("/").pop() || p.id.slice(0, 8);
}

export default function Home() {
  const [projectId, setProjectId] = useQueryState("project", parseAsString);
  const [sessionId, setSessionId] = useQueryState("session", parseAsString);
  const [search, setSearch] = useQueryState("q", parseAsString);
  const [hideSubagents, setHideSubagents] = useQueryState(
    "hideSubagents",
    parseAsBoolean.withDefault(false),
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<{ msg: Message; parts: Part[] }[]>(
    [],
  );
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectsWidth, setProjectsWidth] = useState(200);
  const [sessionsWidth, setSessionsWidth] = useState(280);

  const searchRef = useRef<HTMLInputElement>(null);
  const resizing = useRef<{
    target: "projects" | "sessions";
    startX: number;
    startW: number;
  } | null>(null);

  // Load widths from localStorage on mount
  useEffect(() => {
    const pw = localStorage.getItem("projectsWidth");
    const sw = localStorage.getItem("sessionsWidth");
    if (pw) setProjectsWidth(parseInt(pw));
    if (sw) setSessionsWidth(parseInt(sw));
  }, []);

  // Load projects
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []));
  }, []);

  // Load sessions when project changes
  useEffect(() => {
    if (!projectId) {
      setSessions([]);
      return;
    }
    fetch(`/api/projects/${projectId}/sessions`)
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions || []));
  }, [projectId]);

  // Load session content when session changes
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setCurrentSession(null);
      return;
    }
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.session) {
          setCurrentSession(d.session);
          if (!projectId && d.session.projectID) {
            setProjectId(d.session.projectID);
          }
        }
      });
    fetch(`/api/sessions/${sessionId}/messages`)
      .then((r) => r.json())
      .then(async (d) => {
        const msgs = await Promise.all(
          (d.messages || []).map(async (msg: Message) => {
            const partsRes = await fetch(`/api/messages/${msg.id}/parts`);
            const partsData = await partsRes.json();
            return { msg, parts: partsData.parts || [] };
          }),
        );
        setMessages(msgs);
      });
  }, [sessionId, projectId, setProjectId]);

  // Search
  useEffect(() => {
    if (!search || search.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((d) => setSearchResults(d.results || []));
    }, 150);
    return () => clearTimeout(timeout);
  }, [search]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Resize handlers
  const startResize = useCallback(
    (target: "projects" | "sessions", e: React.MouseEvent) => {
      e.preventDefault();
      const startW = target === "projects" ? projectsWidth : sessionsWidth;
      resizing.current = { target, startX: e.clientX, startW };

      const onMove = (e: MouseEvent) => {
        if (!resizing.current) return;
        const diff = e.clientX - resizing.current.startX;
        const newW = Math.max(
          120,
          Math.min(500, resizing.current.startW + diff),
        );
        if (resizing.current.target === "projects") {
          setProjectsWidth(newW);
          localStorage.setItem("projectsWidth", String(newW));
        } else {
          setSessionsWidth(newW);
          localStorage.setItem("sessionsWidth", String(newW));
        }
      };
      const onUp = () => {
        resizing.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [projectsWidth, sessionsWidth],
  );

  const selectSearchResult = async (r: SearchResult) => {
    setSearchOpen(false);
    setSearch(null);
    if (r.type === "project" && r.project) {
      setProjectId(r.project.id);
      setSessionId(null);
    } else if (r.type === "session" && r.session) {
      setProjectId(r.session.projectID);
      setSessionId(r.session.id);
    } else if (r.type === "content" && r.sessionId) {
      const res = await fetch(`/api/sessions/${r.sessionId}`);
      const data = await res.json();
      if (data.session) {
        setProjectId(data.session.projectID);
        setSessionId(r.sessionId);
      }
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    return text
      .split(regex)
      .map((part, i) =>
        regex.test(part) ? <mark key={i}>{part}</mark> : part,
      );
  };

  // Filter parts based on subagent toggle
  const filterPart = (p: Part): boolean => {
    if (p.type === "snapshot" || p.type === "patch" || p.type === "step-finish")
      return false;
    if (p.type === "text" && !p.text) return false;
    if (p.tool === "todoread") return false;
    if (
      p.type === "tool" &&
      (p.state?.status === "pending" || p.state?.status === "running")
    )
      return false;
    return true;
  };

  // Check if a part is a subagent task
  const isSubagentTask = (p: Part): boolean => {
    return p.tool === "task" && !!p.state?.input?.subagent_type;
  };

  return (
    <div className="app">
      <header className="search-header">
        <div className="search-box">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            ref={searchRef}
            type="text"
            className="search-input"
            placeholder="Search projects, sessions, content..."
            value={search || ""}
            onChange={(e) => setSearch(e.target.value || null)}
            onFocus={() => setSearchOpen(true)}
          />
          <span className="search-shortcut">/</span>
          {searchOpen && (search?.length ?? 0) >= 2 && (
            <div className="search-results">
              {searchResults.length === 0 ? (
                <div className="search-no-results">No results found</div>
              ) : (
                searchResults.map((r, i) => (
                  <div
                    key={i}
                    className="search-result"
                    onClick={() => selectSearchResult(r)}
                  >
                    <span className={`search-result-type ${r.type}`}>
                      {r.type === "project"
                        ? "Project"
                        : r.type === "session"
                          ? "Session"
                          : r.role === "user"
                            ? "User"
                            : r.tool || "Assistant"}
                    </span>
                    <span className="search-result-match">
                      {highlightMatch(r.match, search || "")}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={hideSubagents}
            onChange={(e) => setHideSubagents(e.target.checked)}
          />
          <span>Hide subagents</span>
        </label>
      </header>

      <div className="container">
        <aside className="sidebar-projects" style={{ width: projectsWidth }}>
          <div className="sidebar-header">
            <h1>Projects</h1>
          </div>
          <div className="sidebar-list">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`sidebar-item ${projectId === p.id ? "active" : ""}`}
                onClick={() => {
                  setProjectId(p.id);
                  setSessionId(null);
                }}
              >
                <div className="item-title">{getProjectName(p)}</div>
                <div className="item-meta">{p.worktree}</div>
              </div>
            ))}
          </div>
        </aside>

        <div
          className="resize-handle"
          onMouseDown={(e) => startResize("projects", e)}
        />

        <aside className="sidebar-sessions" style={{ width: sessionsWidth }}>
          <div className="sidebar-header">
            <h1>Sessions</h1>
          </div>
          <div className="sidebar-list">
            {!projectId ? (
              <div className="empty-state">Select a project</div>
            ) : sessions.length === 0 ? (
              <div className="empty-state">No sessions</div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`sidebar-item ${sessionId === s.id ? "active" : ""}`}
                  onClick={() => setSessionId(s.id)}
                >
                  <div className="item-title">{s.title}</div>
                  <div className="item-meta">
                    {formatRelativeTime(s.time?.updated)}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <div
          className="resize-handle"
          onMouseDown={(e) => startResize("sessions", e)}
        />

        <main className="main">
          {!currentSession ? (
            <div className="empty-state">
              <h3>No session selected</h3>
              <p>Choose a session from the sidebar</p>
            </div>
          ) : (
            <>
              <header className="main-header">
                <h2>{currentSession.title}</h2>
                <div className="header-meta">
                  {currentSession.directory && (
                    <span>{currentSession.directory}</span>
                  )}
                  {currentSession.time?.created && (
                    <span>
                      {new Date(currentSession.time.created).toLocaleString()}
                    </span>
                  )}
                </div>
              </header>
              <div className="messages-container">
                <div className="parts">
                  {messages.flatMap(({ msg, parts }) =>
                    parts
                      .filter(filterPart)
                      .filter((p) => !hideSubagents || !isSubagentTask(p))
                      .map((part, i) => (
                        <PartRow
                          key={`${msg.id}-${i}`}
                          part={part}
                          message={msg}
                          hideSubagents={hideSubagents}
                        />
                      )),
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function PartRow({
  part,
  message,
  hideSubagents,
  depth = 0,
}: {
  part: Part;
  message: Message;
  hideSubagents: boolean;
  depth?: number;
}) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);

  if (part.type === "text") {
    return (
      <div className="part-row" style={{ marginLeft: depth * 24 }}>
        <div className="part-decoration">
          <div className="part-icon">{isUser ? "U" : "A"}</div>
        </div>
        <div className="part-content">
          <div className={`message-text ${isUser ? "inverted" : ""}`}>
            <pre>{part.text}</pre>
          </div>
        </div>
      </div>
    );
  }

  if (part.type === "step-start") {
    return (
      <div className="part-row" style={{ marginLeft: depth * 24 }}>
        <div className="part-decoration">
          <div className="part-icon">M</div>
        </div>
        <div className="part-content">
          <div className="step-start">
            <span className="provider">{message.providerID}</span>
            <span className="model">{message.modelID}</span>
          </div>
        </div>
      </div>
    );
  }

  if (part.type === "tool") {
    const input = part.state?.input || {};
    const output = part.state?.output || part.state?.error || "";
    const target =
      input.filePath ||
      input.path ||
      input.pattern ||
      input.url ||
      input.description ||
      "";

    // Handle task (subagent) tool
    if (part.tool === "task" && input.subagent_type) {
      const summary = part.state?.metadata?.summary || [];
      const hasSubContent = summary.length > 0;

      return (
        <div
          className="part-row subagent-row"
          style={{ marginLeft: depth * 24 }}
        >
          <div className="part-decoration">
            <div className="part-icon subagent">S</div>
          </div>
          <div className="part-content">
            <div
              className={`subagent-header ${hasSubContent ? "expandable" : ""}`}
              onClick={() => hasSubContent && setExpanded(!expanded)}
            >
              <span className="subagent-type">{input.subagent_type}</span>
              <span className="subagent-title">
                {input.description || part.state?.title}
              </span>
              {hasSubContent && (
                <span className="expand-icon">{expanded ? "−" : "+"}</span>
              )}
            </div>
            {expanded && hasSubContent && (
              <div className="subagent-content">
                {summary
                  .filter((p: Part) => {
                    if (
                      p.type === "snapshot" ||
                      p.type === "patch" ||
                      p.type === "step-finish"
                    )
                      return false;
                    if (p.type === "text" && !p.text) return false;
                    if (p.tool === "todoread") return false;
                    return true;
                  })
                  .map((subPart: Part, i: number) => (
                    <PartRow
                      key={`${part.id}-sub-${i}`}
                      part={subPart}
                      message={message}
                      hideSubagents={hideSubagents}
                      depth={depth + 1}
                    />
                  ))}
                {output && (
                  <div
                    className="subagent-output"
                    style={{ marginLeft: (depth + 1) * 24 }}
                  >
                    <details>
                      <summary>Final output</summary>
                      <div className="tool-code">
                        <pre>{output.slice(0, 10000)}</pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
            {!expanded && output && (
              <details>
                <summary>Show output</summary>
                <div className="tool-code">
                  <pre>{output.slice(0, 5000)}</pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    if (part.tool === "todowrite" && input.todos) {
      return (
        <div className="part-row" style={{ marginLeft: depth * 24 }}>
          <div className="part-decoration">
            <div className="part-icon">T</div>
          </div>
          <div className="part-content">
            <div className="tool-title">
              <span className="name">Plan</span>
            </div>
            <ul className="todos">
              {input.todos.map((t: any, i: number) => (
                <li key={i} data-status={t.status}>
                  <span />
                  {t.content}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    if (part.tool === "bash") {
      return (
        <div className="part-row" style={{ marginLeft: depth * 24 }}>
          <div className="part-decoration">
            <div className="part-icon">$</div>
          </div>
          <div className="part-content">
            <div className="tool-title">
              <span className="name">bash</span>
              {input.description && (
                <span className="target">{input.description}</span>
              )}
            </div>
            <div className="message-terminal">
              <div className="terminal-header">
                <span>{input.command?.slice(0, 100)}</span>
              </div>
              <div
                className={`terminal-content ${part.state?.status === "error" ? "error" : ""}`}
              >
                <pre>{output.slice(0, 5000)}</pre>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="part-row" style={{ marginLeft: depth * 24 }}>
        <div className="part-decoration">
          <div className="part-icon">T</div>
        </div>
        <div className="part-content">
          <div className="tool-title">
            <span className="name">{part.tool}</span>
            {target && <span className="target">{target}</span>}
          </div>
          {output && (
            <details>
              <summary>Show output</summary>
              <div className="tool-code">
                <pre>{output.slice(0, 5000)}</pre>
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }

  return null;
}
