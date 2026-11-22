const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("shinba", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setTheme: (theme) => ipcRenderer.invoke("settings:set-theme", theme),
  setVimEnabled: (enabled) => ipcRenderer.invoke("settings:set-vim", enabled),
  open: () => ipcRenderer.invoke("project:open"),
  tree: (p) => ipcRenderer.invoke("project:tree", p),
  read: (p) => ipcRenderer.invoke("file:read", p),
  write: (p, t, expected) => ipcRenderer.invoke("file:write", p, t, expected),
  load: () => ipcRenderer.invoke("board:load"),
  save: (b, r) => ipcRenderer.invoke("board:save", b, r),
  symbols: (p, t) => ipcRenderer.invoke("lsp:symbols", p, t),
  definition: (p, t, pos) => ipcRenderer.invoke("lsp:definition", p, t, pos),
  terminalStart: (cols, rows) =>
    ipcRenderer.invoke("terminal:start", cols, rows),
  terminalWrite: (t) => ipcRenderer.send("terminal:write", t),
  terminalResize: (c, r) => ipcRenderer.send("terminal:resize", c, r),
  onShortcut: (fn) => {
    const listener = (_e, action) => fn(action);
    ipcRenderer.on("shortcut", listener);
    return () => ipcRenderer.removeListener("shortcut", listener);
  },
  onTerminal: (fn) => {
    const listener = (_e, data) => fn(data);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
});
