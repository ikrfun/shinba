import { themes, themeVariables } from "./theme.js";
import { Settings } from "./Settings.jsx";
import { canNest, reparentCard } from "./cardHierarchy.js";
import { useVim } from "./useVim.js";
import { createAutosave } from "./autosave.js";
import { nodeTypes } from "./Card.jsx";
import { Term } from "./Terminal.jsx";
import { Tree } from "./Tree.jsx";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker";
import TsWorker from "../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";
self.MonacoEnvironment = {
  getWorker(_id, label) {
    return label === "typescript" || label === "javascript"
      ? new TsWorker()
      : new EditorWorker();
  },
};
loader.config({ monaco });
import "@xterm/xterm/css/xterm.css";
import "./style.css";
const api = window.shinba;
const uid = () => crypto.randomUUID();
function App() {
  const [project, setProject] = useState(null),
    [nodes, setNodes] = useState([]),
    [edges, setEdges] = useState([]),
    [active, setActive] = useState("board"),
    [file, setFile] = useState(null),
    [text, setText] = useState(""),
    [dirty, setDirty] = useState(false),
    [symbol, setSymbol] = useState(null),
    [terminal, setTerminal] = useState(false),
    [message, setMessage] = useState("Open a folder to get started"),
    [refresh, setRefresh] = useState(0),
    [vimEnabled, setVimEnabled] = useState(true),
    [theme, setTheme] = useState("dark"),
    [settingsReady, setSettingsReady] = useState(false),
    [editorInstance, setEditorInstance] = useState(null);
  const vimStatus = useRef(null);
  useVim(editorInstance, vimEnabled, vimStatus, setMessage);
  useEffect(() => {
    api
      .getSettings()
      .then((settings) => {
        setVimEnabled(settings.vimEnabled);
        setTheme(settings.theme);
      })
      .catch((error) => setMessage(`Could not load settings: ${error.message}`))
      .finally(() => setSettingsReady(true));
  }, []);
  useEffect(() => {
    const selected = themes[theme];
    for (const [key, value] of Object.entries(themeVariables(selected)))
      document.documentElement.style.setProperty(key, value);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const changeTheme = async (next) => {
    try {
      await api.setTheme(next);
      setTheme(next);
    } catch (error) {
      setMessage(`Could not save settings: ${error.message}`);
    }
  };
  const toggleVim = async () => {
    const next = !vimEnabled;
    try {
      await api.setVimEnabled(next);
      setVimEnabled(next);
    } catch (error) {
      setMessage(`Could not save settings: ${error.message}`);
    }
  };
  const editor = useRef(null),
    content = useRef(""),
    fileRef = useRef(null),
    symbolRef = useRef(null),
    savedText = useRef(""),
    boardRevision = useRef(0),
    boardBaseline = useRef(null),
    boardReady = useRef(false),
    saves = useRef(null);
  if (!saves.current) {
    const status = (kind) => (state, error) => {
      if (state === "error")
        setMessage(`Failed to save ${kind}: ${error.message}`);
      else if (state === "saved") setMessage(`${kind} autosaved`);
      else setMessage(`Saving ${kind}…`);
      if (kind === "File") setDirty(state !== "saved");
    };
    saves.current = {
      file: createAutosave(async ({ path, text }) => {
        await api.write(path, text, savedText.current);
        savedText.current = text;
      }, status("File")),
      board: createAutosave(async (board) => {
        const saved = await api.save(board, boardRevision.current);
        boardRevision.current = saved.revision;
      }, status("Board")),
    };
  }
  const serializeBoard = (nodes, edges) => ({
    id: "main",
    name: "メインボード",
    nodes: nodes.map(
      ({ id, type, position, data, parentId, style, width, height }) => ({
        id,
        type,
        position,
        data,
        ...(parentId ? { parentId } : {}),
        ...(style ? { style } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      }),
    ),
    edges: edges.map(({ selected, ...edge }) => edge),
  });
  useEffect(() => {
    if (!boardReady.current) return;
    const snapshot = serializeBoard(nodes, edges);
    const serialized = JSON.stringify(snapshot);
    if (serialized !== boardBaseline.current) {
      boardBaseline.current = serialized;
      saves.current.board.schedule(snapshot);
    }
  }, [nodes, edges]);
  useEffect(() => {
    const warn = (event) => {
      if (saves.current.file.hasChanges() || saves.current.board.hasChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    content.current = text;
  }, [text]);
  useEffect(() => {
    fileRef.current = file;
  }, [file]);
  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);
  const load = async () => {
    const b = await api.load();
    const loadedNodes = b?.nodes || [],
      loadedEdges = b?.edges || [];
    boardRevision.current = b?.revision || 0;
    boardBaseline.current = JSON.stringify(
      serializeBoard(loadedNodes, loadedEdges),
    );
    boardReady.current = true;
    setNodes(loadedNodes);
    setEdges(loadedEdges);
  };
  const openProject = async () => {
    try {
      await Promise.all([
        saves.current.file.flush(),
        saves.current.board.flush(),
      ]);
      const p = await api.open();
      if (!p) return;
      boardReady.current = false;
      setProject(p);
      fileRef.current = null;
      content.current = "";
      setFile(null);
      setText("");
      setDirty(false);
      setSymbol(null);
      setTerminal(false);
      setActive("board");
      await load();
      setMessage("Project opened");
    } catch (e) {
      setMessage(e.message);
    }
  };
  const shortcutHandlers = useRef({});
  shortcutHandlers.current = { openProject, project };
  useEffect(
    () =>
      api.onShortcut((action) => {
        if (action === "open-project") shortcutHandlers.current.openProject();
        if (action === "open-settings") setActive("settings");
        if (action === "toggle-terminal") {
          if (shortcutHandlers.current.project) setTerminal((value) => !value);
          else setMessage("Open a folder first");
        }
      }),
    [],
  );
  const openFile = async (p, position) => {
    try {
      const changingFile = fileRef.current !== p;
      if (changingFile) await saves.current.file.flush();
      const t = changingFile ? await api.read(p) : content.current;
      fileRef.current = p;
      content.current = t;
      if (changingFile) savedText.current = t;
      setFile(p);
      setText(t);
      if (changingFile) setDirty(false);
      setActive("code");
      if (position)
        setTimeout(() => {
          editor.current?.setPosition({
            lineNumber: position.line + 1,
            column: position.character + 1,
          });
          editor.current?.revealLineInCenter(position.line + 1);
          editor.current?.focus();
        }, 100);
    } catch (e) {
      setMessage(e.message);
    }
  };
  const chooseSymbol = (p, s) => {
    const range = s.selectionRange || s.range || s.location?.range;
    if (!range) return;
    setSymbol({ path: p, name: s.name, kind: s.kind, range });
    openFile(p, range.start);
  };
  const openLink = async (l) => {
    try {
      const t = await api.read(l.path);
      const syms = await api.symbols(l.path, t);
      const flatten = (a) =>
        a.flatMap((x) => [x, ...flatten(x.children || [])]);
      const matches = flatten(syms).filter(
        (x) => x.name === l.name && x.kind === l.kind,
      );
      if (matches.length !== 1) {
        setMessage(
          "Could not uniquely identify the linked symbol. Select it again.",
        );
        return;
      }
      openFile(
        l.path,
        (
          matches[0].selectionRange ||
          matches[0].range ||
          matches[0].location.range
        ).start,
      );
    } catch (e) {
      setMessage("Could not resolve link: " + e.message);
    }
  };
  const update = useCallback(
    (id, patch) =>
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      ),
    [],
  );
  const link = useCallback(
    (id) => {
      if (!symbolRef.current) {
        setMessage("Select a symbol in the file tree first");
        return;
      }
      update(id, { codeLink: symbolRef.current });
      setMessage("Symbol linked");
    },
    [update],
  );
  const reparent = (id, parentId) => {
    try {
      setNodes((current) => reparentCard(current, id, parentId));
    } catch (error) {
      setMessage(error.message);
    }
  };
  const shown = nodes.map((n) => ({
    ...n,
    ...(n.parentId ? { extent: "parent" } : {}),
    data: {
      ...n.data,
      update,
      link,
      openLink,
      reparent,
      parentId: n.parentId,
      hasChildren: nodes.some((child) => child.parentId === n.id),
      minWidth: Math.max(
        180,
        ...nodes
          .filter((child) => child.parentId === n.id)
          .map(
            (child) =>
              child.position.x +
              (child.measured?.width ??
                child.width ??
                child.style?.width ??
                260) +
              20,
          ),
      ),
      minHeight: Math.max(
        100,
        ...nodes
          .filter((child) => child.parentId === n.id)
          .map(
            (child) =>
              child.position.y +
              (child.measured?.height ??
                child.height ??
                child.style?.height ??
                200) +
              20,
          ),
      ),
      parentOptions: nodes.filter(
        (candidate) =>
          candidate.id !== n.id && canNest(nodes, n.id, candidate.id),
      ),
    },
  }));
  const editorMount = (instance, monaco) => {
    editor.current = instance;
    setEditorInstance(instance);
    instance.onDidDispose(() => {
      setEditorInstance((current) => (current === instance ? null : current));
    });
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saves.current.file.flush().catch((e) => setMessage(e.message));
    });
    instance.addAction({
      id: "shinba-definition",
      label: "Go to Definition (LSP)",
      keybindings: [monaco.KeyCode.F12],
      run: async (ed) => {
        try {
          const p = ed.getPosition();
          const results = await api.definition(
            fileRef.current,
            content.current,
            { line: p.lineNumber - 1, character: p.column - 1 },
          );
          if (!results.length) {
            setMessage("Definition not found");
            return;
          }
          const result = results[0],
            url = result.uri || result.targetUri,
            range = result.range || result.targetSelectionRange;
          const root = new URL(
            "file://" + encodeURI(project.path.replace(/\/$/, "")) + "/",
          );
          const decoded = decodeURIComponent(new URL(url).pathname),
            base = decodeURIComponent(root.pathname);
          if (!decoded.startsWith(base)) {
            setMessage("Cannot open a definition outside the project");
            return;
          }
          openFile(decoded.slice(base.length), range.start);
        } catch (e) {
          setMessage("Could not find definition: " + e.message);
        }
      },
    });
  };
  return (
    <>
      <main>
        <aside>
          <h3 className="explorer-title">
            {project && (
              <span
                className="codicon codicon-folder-opened"
                aria-hidden="true"
              />
            )}{" "}
            {project ? project.name : "Explorer"}
          </h3>
          {!project && (
            <p>
              ⌘O / Ctrl+O to open a folder
              <br />
              Ctrl+` to toggle the terminal
            </p>
          )}
          {project && (
            <Tree
              key={project.path}
              onFile={openFile}
              onSymbol={chooseSymbol}
              refresh={refresh}
              selectedFile={file}
              selectedSymbol={symbol}
            />
          )}
          <p>
            {symbol
              ? `Selected: ${symbol.name}`
              : "Select a symbol to link it to a card"}
          </p>
        </aside>
        <section className="workspace">
          <nav>
            <button
              onClick={() => setActive("board")}
              className={active === "board" ? "active" : ""}
            >
              Board
            </button>
            <button
              onClick={() => setActive("settings")}
              className={active === "settings" ? "active" : ""}
            >
              Settings
            </button>
            {file && (
              <button
                onClick={() => setActive("code")}
                className={active === "code" ? "active" : ""}
              >
                {file}
                {dirty ? " ●" : ""}
              </button>
            )}
          </nav>
          <div
            className="content"
            style={{ display: active === "board" ? "block" : "none" }}
          >
            {project && (
              <>
                <div className="toolbar">
                  <button
                    onClick={() =>
                      setNodes((ns) => [
                        ...ns,
                        {
                          id: uid(),
                          type: "card",
                          position: {
                            x: 80 + ns.length * 25,
                            y: 80 + ns.length * 25,
                          },
                          data: { title: "New card", body: "" },
                          style: { width: 260, height: 200 },
                        },
                      ])
                    }
                  >
                    ＋ Card
                  </button>
                  <span>Connect cards using the handles</span>
                </div>
                <ReactFlow
                  nodes={shown}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={(changes) =>
                    setNodes((ns) => applyNodeChanges(changes, ns))
                  }
                  onEdgesChange={(changes) =>
                    setEdges((es) => applyEdgeChanges(changes, es))
                  }
                  onConnect={(c) => setEdges((es) => addEdge(c, es))}
                  onBeforeDelete={async ({ nodes: toDelete }) => {
                    const ids = new Set(toDelete.map((node) => node.id));
                    if (
                      nodes.some(
                        (node) => node.parentId && ids.has(node.parentId),
                      )
                    ) {
                      setMessage(
                        "Remove nested cards from their parent before deleting it.",
                      );
                      return false;
                    }
                    return true;
                  }}
                  fitView
                >
                  <Background color={themes[theme].grid} />
                  <Controls />
                </ReactFlow>
              </>
            )}
          </div>
          <div
            className="content code"
            style={{ display: active === "code" ? "flex" : "none" }}
          >
            {file && (
              <>
                <div className="toolbar">
                  <span>F12: Go to Definition</span>
                  <button
                    onClick={toggleVim}
                    disabled={!settingsReady}
                    aria-pressed={vimEnabled}
                  >
                    Vim {vimEnabled ? "on" : "off"}
                  </button>
                  <span
                    className="vim-status"
                    ref={vimStatus}
                    aria-live="polite"
                  />
                </div>
                <Editor
                  path={file}
                  theme={themes[theme].monaco}
                  height="100%"
                  defaultLanguage={
                    file.endsWith(".tsx") ? "typescript" : undefined
                  }
                  value={text}
                  onChange={(v) => {
                    const next = v || "";
                    if (next === content.current) return;
                    content.current = next;
                    setText(next);
                    setDirty(true);
                    saves.current.file.schedule({
                      path: fileRef.current,
                      text: next,
                    });
                  }}
                  onMount={editorMount}
                  options={{
                    minimap: { enabled: false },
                    autoDetectHighContrast: false,
                    automaticLayout: true,
                  }}
                />
              </>
            )}
          </div>
          {active === "settings" && (
            <Settings
              theme={theme}
              onThemeChange={changeTheme}
              vimEnabled={vimEnabled}
              onToggleVim={toggleVim}
              disabled={!settingsReady}
            />
          )}
          <Term
            key={project?.path || "no-project"}
            enabled={terminal}
            theme={themes[theme]}
          />
        </section>
      </main>
      <footer>{message}</footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
