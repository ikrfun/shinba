import { themes, themeVariables } from "./theme.js";
import { Settings } from "./Settings.jsx";
import { reparentCard } from "../shared/cardHierarchy.mjs";
import { BoardView } from "./BoardView.jsx";
import { useDocuments } from './useDocuments.js';
import { documentModelPath } from './CodePane.jsx';
import { EditorWorkspace } from './EditorWorkspace.jsx';
import { useBoard } from "./useBoard.js";
import { BoardConflicts } from "./BoardConflicts.jsx";
import { createCard, updateCardData } from "../shared/cards.mjs";
import { Term } from "./Terminal.jsx";
import { Splitter } from './Splitter.jsx';
import { WorkspaceTab } from './WorkspaceTab.jsx';
import { shortcutLabel } from './ShortcutSettings.jsx';
import { Tree } from "./Tree.jsx";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { loader } from "@monaco-editor/react";
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
    [active, setActive] = useState("board"),
    [boardOpen, setBoardOpen] = useState(true),
    [settingsOpen, setSettingsOpen] = useState(true),
    [primaryDoc, setPrimaryDoc] = useState(null),
    [secondaryDoc, setSecondaryDoc] = useState(null),
    [focusedPane, setFocusedPane] = useState('primary'),
    [editorSplit, setEditorSplit] = useState(false),
    [boardSplit, setBoardSplit] = useState(false),
    [closingFile, setClosingFile] = useState(null),
    [symbol, setSymbol] = useState(null),
    [terminal, setTerminal] = useState(false),
    [message, setMessage] = useState("Open a folder to get started"),
    [refresh, setRefresh] = useState(0),
    [vimEnabled, setVimEnabled] = useState(true),
    [theme, setTheme] = useState("dark"),
    [layout, setLayout] = useState({ sidebarVisible: true, sidebarWidth: 245, terminalHeight: 240, boardMinimap: false, editorMinimap: false }),
    [bindings, setBindings] = useState({}),
    [defaultBindings, setDefaultBindings] = useState({}),
    [overview, setOverview] = useState(false),
    [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight }),
    [settingsReady, setSettingsReady] = useState(false),
    [boardMode, setBoardMode] = useState("normal"),
    [boardCommand, setBoardCommand] = useState(null),
    [flow, setFlow] = useState(null);
  const flowContainer = useRef(null);
  const workspaceRef = useRef(null);
  const terminalRef = useRef(null);
  const focusRegion = useRef('workspace');
  const paneRef = useRef('primary');
  const editors = useRef({ primary:null, secondary:null });
  const boardOpenRef = useRef(boardOpen);
  boardOpenRef.current = boardOpen;
  const layoutRef = useRef(layout);
  const board = useBoard(setMessage);
  const documents = useDocuments(setMessage);
  const documentList = documents.all();
  const currentDocId = focusedPane === 'secondary' && editorSplit ? secondaryDoc : primaryDoc;
  const currentDoc = documents.get(currentDocId);
  const { nodes, setNodes } = board;
  useEffect(() => {
    if (active === 'settings') setSettingsOpen(true);
  }, [active]);
  useEffect(() => {
    const resize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    api
      .getSettings()
      .then((settings) => {
        setVimEnabled(settings.vimEnabled);
        setTheme(settings.theme);
        if (settings.layout) { layoutRef.current = settings.layout; setLayout(settings.layout); }
        if (settings.keybindings) setBindings(settings.keybindings);
        if (settings.defaultKeybindings) setDefaultBindings(settings.defaultKeybindings);
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
  const changeLayout = patch => {
    layoutRef.current = { ...layoutRef.current, ...patch };
    setLayout(layoutRef.current);
    api.setLayout(patch).catch(error => setMessage(`Could not save layout: ${error.message}`));
  };
  const previewLayout = patch => {
    layoutRef.current = { ...layoutRef.current, ...patch };
    setLayout(layoutRef.current);
  };
  const changeBindings = async next => {
    const saved = await api.setKeybindings(next);
    setBindings(saved);
  };
  const symbolRef = useRef(null);
  useEffect(() => {
    const warn = (event) => {
      if (documents.hasPending() || board.hasPending()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (boardMode === "normal" && board.external) board.check();
  }, [boardMode, board.external]);
  useEffect(() => {
    const onKey = (event) => {
      if (active !== "board" || !project || board.conflict || board.busy || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "Escape" && boardMode === "insert") {
        if (target instanceof HTMLElement) target.blur();
        setBoardMode("normal");
        event.preventDefault();
      } else if (!typing && boardMode === "normal" && event.key === "i") {
        setBoardMode("insert");
        event.preventDefault();
      } else if (!typing && boardMode === "normal" && (event.key === ":" || event.key === ";")) {
        setBoardCommand("");
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, project, boardMode, board.conflict, board.busy]);
  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);
  const openProject = async () => {
    try {
      if (!await documents.prepareProjectSwitch()) return;
      await board.flush();
      const p = await api.open();
      if (!p) return;
      setProject(p);
      const oldModels = documents.all().map(documentModelPath);
      documents.clear();
      setPrimaryDoc(null); setSecondaryDoc(null); setEditorSplit(false); setBoardSplit(false);
      oldModels.forEach(disposeUnusedModel);
      setSymbol(null);
      setTerminal(false);
      setBoardOpen(true);
      setActive("board");
      setBoardMode("normal");
      await board.load(p);
      setMessage("Project opened");
    } catch (e) {
      setMessage(e.message);
    }
  };
  const shortcutHandlers = useRef({});
  useEffect(
    () =>
      api.onShortcut((action) => {
        if (action === "open-project") shortcutHandlers.current.openProject();
        if (action === "open-settings") { setSettingsOpen(true); setActive("settings"); }
        if (action === "toggle-terminal") {
          if (shortcutHandlers.current.project) setTerminal((value) => !value);
          else setMessage("Open a folder first");
        }
        if (action === 'toggle-sidebar') shortcutHandlers.current.toggleSidebar();
        if (action === 'save') shortcutHandlers.current.save();
        if (action === 'toggle-minimap') shortcutHandlers.current.toggleMinimap();
        if (action === 'go-definition') shortcutHandlers.current.goDefinition();
        if (action === 'split-view') shortcutHandlers.current.splitView();
        if (action === 'new-tab') shortcutHandlers.current.newTab();
      }),
    [],
  );
  const openFile = async (p, position) => {
    try {
      const id = await documents.open(p);
      const pane = editorSplit ? paneRef.current : 'primary';
      if (pane === 'secondary') setSecondaryDoc(id); else setPrimaryDoc(id);
      setActive("code");
      if (position)
        setTimeout(() => {
          editors.current[pane]?.setPosition({
            lineNumber: position.line + 1,
            column: position.character + 1,
          });
          editors.current[pane]?.revealLineInCenter(position.line + 1);
          editors.current[pane]?.focus();
        }, 100);
    } catch (e) {
      setMessage(e.message);
    }
  };
  const closeFile = async id => {
    const doc = documents.get(id);
    if (!doc || closingFile) return;
    setClosingFile(id);
    try {
      const modelPath = documentModelPath(doc);
      if (!await documents.close(id)) return;
      const replacement = documents.all().at(-1)?.id || null;
      setPrimaryDoc(current => current === id ? replacement : current);
      setSecondaryDoc(current => current === id ? replacement : current);
      disposeUnusedModel(modelPath);
      if (!replacement) setActive(current => current === 'code' ? (boardOpenRef.current ? 'board' : 'settings') : current);
    } catch (error) {
      setMessage(`Could not close ${doc.label}: ${error.message}`);
    } finally {
      setClosingFile(null);
    }
  };
  const disposeUnusedModel = modelPath => setTimeout(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(modelPath));
    if (model && !Object.values(editors.current).some(instance => instance?.getModel() === model)) model.dispose();
  }, 100);
  const newEditorTab = () => {
    const id = documents.createUntitled();
    if (editorSplit && paneRef.current === 'secondary') setSecondaryDoc(id); else setPrimaryDoc(id);
    setActive('code');
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
  const openMarkdownLink = href => {
    if (/^(https?:|mailto:)/i.test(href)) api.openExternal(href).catch(e => setMessage(`Could not open link: ${e.message}`));
    else if (!href.startsWith('#') && !/^[a-z][a-z\d+.-]*:/i.test(href)) {
      try { openFile(decodeURIComponent(href.split('#')[0])); }
      catch (error) { setMessage(`Could not open link: ${error.message}`); }
    }
  };
  const update = useCallback(
    (id, patch) =>
      setNodes((ns) => updateCardData(ns, id, patch)),
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
  const addCard = (template) => {
    if (!board.ready || board.busy || !flow) return;
    if (template && template !== "html") {
      setMessage(`Unknown card type: ${template}`);
      return;
    }
    const bounds = flowContainer.current?.querySelector(".react-flow")?.getBoundingClientRect();
    if (!bounds) return;
    const center = flow.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    const zIndex = Math.max(0, ...nodes.map(node => Number(node.zIndex) || 0)) + 1;
    const card = createCard({ id: uid(), x: center.x - 130, y: center.y - 100, templateId: template, zIndex });
    setNodes(ns => [...ns.map(node => ({ ...node, selected: false })), { ...card, selected: true }]);
  };
  const runBoardCommand = command => {
    setBoardCommand(null);
    const [name, ...args] = command.trim().split(/\s+/);
    if (name === "w" && args.length === 0) board.commit();
    else if (name === "ac" && args.length <= 1) addCard(args[0]);
    else setMessage(`Unknown board command: ${command}`);
  };
  const goDefinition = async () => {
        const ed = editors.current[focusedPane];
        if (active !== 'code' || !ed || !currentDoc?.path || !project) return;
        try {
          const p = ed.getPosition();
          const results = await api.definition(
            currentDoc.path,
            currentDoc.text,
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
  };
  shortcutHandlers.current = {
    openProject, project, goDefinition,
    save: () => {
      if (active === 'board' && boardOpen) board.commit();
      else if (active === 'code' && currentDocId) {
        const oldModelPath = documentModelPath(currentDoc);
        documents.save(currentDocId).then(() => {
          const doc = documents.get(currentDocId);
          if (doc && documentModelPath(doc) !== oldModelPath) disposeUnusedModel(oldModelPath);
        }).catch(error => setMessage(`Could not save file: ${error.message}`));
      }
    },
    toggleSidebar: () => changeLayout({ sidebarVisible: !layoutRef.current.sidebarVisible }),
    toggleMinimap: () => {
      const key = active === 'code' ? 'editorMinimap' : 'boardMinimap';
      changeLayout({ [key]: !layoutRef.current[key] });
    },
    splitView: () => {
      if (terminal && focusRegion.current === 'terminal') { terminalRef.current?.split(); return; }
      if (!project) { setMessage('Open a folder first'); return; }
      if (active === 'board') {
        if (!primaryDoc) setPrimaryDoc(documents.createUntitled());
        setBoardSplit(true); setActive('code');
      } else if (active === 'code' && !editorSplit) {
        setSecondaryDoc(currentDocId); setEditorSplit(true); paneRef.current='secondary'; setFocusedPane('secondary');
      }
    },
    newTab: () => {
      if (terminal && focusRegion.current === 'terminal') terminalRef.current?.newTab();
      else if (project) newEditorTab();
      else setMessage('Open a folder first');
    },
  };
  const maxSidebar = Math.max(160, Math.min(700, windowSize.width - 320));
  const maxTerminal = Math.max(100, Math.min(1000, (workspaceRef.current?.clientHeight || windowSize.height) - 180));
  const sidebarWidth = Math.min(layout.sidebarWidth, maxSidebar);
  const terminalHeight = Math.min(layout.terminalHeight, maxTerminal);
  return (
    <>
      <main>
        {layout.sidebarVisible && <><aside style={{ width: sidebarWidth }} onPointerDownCapture={() => { focusRegion.current='workspace'; }} onFocusCapture={() => { focusRegion.current='workspace'; }}>
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
              {shortcutLabel(bindings['open-project'])} to open a folder
              <br />
              {shortcutLabel(bindings['toggle-terminal'])} to toggle the terminal
            </p>
          )}
          {project && (
            <Tree
              key={project.path}
              onFile={openFile}
              onSymbol={chooseSymbol}
              refresh={refresh}
              selectedFile={currentDoc?.path}
              selectedSymbol={symbol}
            />
          )}
          {!boardOpen && (
            <button
              className="reopen-board"
              onClick={() => {
                setBoardOpen(true);
                setActive("board");
              }}
            >
              Open Board
            </button>
          )}
          <p>
            {symbol
              ? `Selected: ${symbol.name}`
              : "Select a symbol to link it to a card"}
          </p>
        </aside><Splitter direction="vertical" label="Resize sidebar" value={sidebarWidth} min={160} max={maxSidebar}
          onChange={width => previewLayout({sidebarWidth:width})} onCommit={width => changeLayout({sidebarWidth:width})} /></>}
        <section className="workspace" ref={workspaceRef}>
          <nav onPointerDownCapture={() => { focusRegion.current='workspace'; }} onFocusCapture={() => { focusRegion.current='workspace'; }}>
            <button className="sidebar-toggle" aria-label="Toggle sidebar" aria-pressed={layout.sidebarVisible} onClick={() => changeLayout({sidebarVisible:!layout.sidebarVisible})} title="Toggle sidebar">☰</button>
            {boardOpen && (
              <WorkspaceTab label="Board" active={active === "board"} onSelect={() => setActive("board")}
                  onClose={() => {
                    setBoardOpen(false);
                    setBoardSplit(false);
                    if (active === "board")
                      setActive(documentList.length ? "code" : "settings");
                  }} />
            )}
            {settingsOpen && <WorkspaceTab label="Settings" active={active === "settings"}
              onSelect={() => setActive("settings")}
              onClose={() => {
                setSettingsOpen(false);
                if (active === "settings") setActive(boardOpen ? "board" : documentList.length ? "code" : "empty");
              }} />}
            {documentList.map(doc => <WorkspaceTab key={doc.id} label={doc.label} active={active === 'code' && currentDocId === doc.id} dirty={doc.dirty}
              onSelect={() => { if (editorSplit && paneRef.current === 'secondary') setSecondaryDoc(doc.id); else setPrimaryDoc(doc.id); setActive('code'); }}
              onClose={() => closeFile(doc.id)} closeDisabled={closingFile === doc.id || doc.saving} />)}
            {project && <button aria-label="New editor tab" onClick={newEditorTab}>+</button>}
          </nav>
          <div className={`work-views${boardSplit && boardOpen ? ' split-board' : ''}`} style={{display:active === 'settings' ? 'none' : 'flex'}}>
          <BoardView ref={flowContainer} project={project} visible={boardOpen && (active === "board" || boardSplit)}
            onFocus={() => { focusRegion.current = 'workspace'; if (boardSplit) setActive('board'); }}
            board={board} mode={boardMode} command={boardCommand} setCommand={setBoardCommand} runCommand={runBoardCommand}
            addCard={addCard} layout={layout} changeLayout={changeLayout} theme={themes[theme]}
            onFlow={setFlow} overview={overview} onOverview={setOverview}
            update={update} link={link} openLink={openLink} reparent={reparent} openMarkdownLink={openMarkdownLink}
            onEditBlur={() => { if (board.external) setTimeout(board.check, 0); }} onMessage={setMessage} />
          <EditorWorkspace visible={active === 'code' || boardSplit} split={editorSplit}
            primary={documents.get(primaryDoc)} secondary={documents.get(secondaryDoc)} focused={focusedPane}
            theme={themes[theme]} vimEnabled={vimEnabled} settingsReady={settingsReady} layout={layout} bindings={bindings}
            onToggleVim={toggleVim} onLayoutChange={changeLayout} onChange={documents.change} onError={setMessage} onNew={newEditorTab}
            onFocus={() => { focusRegion.current='workspace'; }}
            onPaneFocus={group => { paneRef.current=group; setFocusedPane(group); focusRegion.current='workspace'; if (boardSplit) setActive('code'); }}
            onClosePane={group => group === 'secondary' ? () => { setEditorSplit(false); setSecondaryDoc(null); paneRef.current='primary'; setFocusedPane('primary'); } : boardSplit && !editorSplit ? () => { setBoardSplit(false); setActive('board'); } : null}
            onEditor={(name, instance, disposed) => { if (instance || editors.current[name] === disposed) editors.current[name]=instance; }} />
          </div>
          {active === "settings" && (
            <Settings
              theme={theme}
              onThemeChange={changeTheme}
              vimEnabled={vimEnabled}
              onToggleVim={toggleVim}
              disabled={!settingsReady}
              layout={layout}
              onLayoutChange={changeLayout}
              bindings={bindings}
              defaultBindings={defaultBindings}
              onBindingsChange={changeBindings}
              onFocus={() => { focusRegion.current='workspace'; }}
            />
          )}
          {terminal && <Splitter direction="horizontal" label="Resize terminal" value={terminalHeight} min={100} max={maxTerminal}
            onChange={height => previewLayout({terminalHeight:height})} onCommit={height => changeLayout({terminalHeight:height})} />}
          <Term
            key={project?.path || "no-project"}
            ref={terminalRef}
            onFocus={() => { focusRegion.current = 'terminal'; }}
            enabled={terminal}
            theme={themes[theme]}
            height={terminalHeight}
          />
        </section>
      </main>
      <BoardConflicts kind="file" conflict={documents.conflict} busy={documents.busy} onCancel={documents.cancelConflict} onSave={documents.resolve} />
      <BoardConflicts conflict={board.conflict} busy={board.busy} onCancel={() => board.setConflict(null)} onSave={board.commit} />
      <footer>{message}</footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
