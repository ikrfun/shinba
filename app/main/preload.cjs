const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("shinba", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setTheme: (theme) => ipcRenderer.invoke("settings:set-theme", theme),
  setVimEnabled: (enabled) => ipcRenderer.invoke("settings:set-vim", enabled),
  setKeybindings: (bindings) => ipcRenderer.invoke('settings:set-keybindings', bindings),
  setLayout: (layout) => ipcRenderer.invoke('settings:set-layout', layout),
  setShortcutCapture: (enabled) => ipcRenderer.invoke('shortcuts:capture', enabled),
  platform: process.platform,
  open: () => ipcRenderer.invoke("project:open"),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  tree: (p) => ipcRenderer.invoke("project:tree", p),
  read: (p) => ipcRenderer.invoke("file:read", p),
  readImage: (p) => ipcRenderer.invoke('file:read-image', p),
  write: (p, t, expected, resolution) => ipcRenderer.invoke("file:write", p, t, expected, resolution),
  saveAs: (text) => ipcRenderer.invoke('file:save-as', text),
  discardUntitled: (label) => ipcRenderer.invoke('file:discard-untitled', label),
  load: () => ipcRenderer.invoke("board:load"),
  beginDraft: (b) => ipcRenderer.invoke("board:draft-begin", b),
  loadDraft: (id) => ipcRenderer.invoke("board:draft-load", id),
  writeDraft: (id, board) => ipcRenderer.invoke("board:draft-write", id, board),
  refreshDraft: (id) => ipcRenderer.invoke("board:draft-refresh", id),
  saveDraft: (id, resolution) => ipcRenderer.invoke("board:draft-save", id, resolution),
  onBoardChanged: (fn) => {
    const listener = (_e, project) => fn(project);
    ipcRenderer.on("board:changed", listener);
    return () => ipcRenderer.removeListener("board:changed", listener);
  },
  onBoardWatchError: (fn) => {
    const listener = (_e, project) => fn(project);
    ipcRenderer.on("board:watch-error", listener);
    return () => ipcRenderer.removeListener("board:watch-error", listener);
  },
  symbols: (p, t) => ipcRenderer.invoke("lsp:symbols", p, t),
  definition: (p, t, pos) => ipcRenderer.invoke("lsp:definition", p, t, pos),
  terminalStart: (id, cols, rows) => ipcRenderer.invoke("terminal:start", id, cols, rows),
  terminalWrite: (id, t) => ipcRenderer.send("terminal:write", id, t),
  terminalResize: (id, c, r) => ipcRenderer.send("terminal:resize", id, c, r),
  terminalClose: (id) => ipcRenderer.send('terminal:close', id),
  onShortcut: (fn) => {
    const listener = (_e, action) => fn(action);
    ipcRenderer.on("shortcut", listener);
    return () => ipcRenderer.removeListener("shortcut", listener);
  },
  onTerminal: (fn) => {
    const listener = (_e, id, data) => fn(id, data);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
});
