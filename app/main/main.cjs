const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const { registerSettings } = require("./settings.cjs");
const { registerStorage } = require("./storage.cjs");
const { createLanguageService } = require("./language-service.cjs");
let root = null,
  win,
  terminal = null;
function inside(relative = "") {
  if (!root) throw new Error("Open a project folder first");
  const result = path.resolve(root, relative);
  if (result !== root && !result.startsWith(root + path.sep))
    throw new Error("The path is outside the project");
  return result;
}
const language = createLanguageService({
  app,
  ipcMain,
  getRoot: () => root,
  inside,
});
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) return;
    const primary = process.platform === "darwin" ? input.meta : input.control;
    if (
      primary &&
      !input.alt &&
      !input.shift &&
      (input.key === "," || input.code === "Comma")
    ) {
      event.preventDefault();
      win.webContents.send("shortcut", "open-settings");
    } else if (
      primary &&
      !input.alt &&
      !input.shift &&
      input.key.toLowerCase() === "o"
    ) {
      event.preventDefault();
      win.webContents.send("shortcut", "open-project");
    } else if (
      input.control &&
      !input.meta &&
      !input.alt &&
      (input.code === "Backquote" || input.key === "`")
    ) {
      event.preventDefault();
      win.webContents.send("shortcut", "toggle-terminal");
    }
  });
  win.loadURL(
    process.env.VITE_URL ||
      `file://${path.join(__dirname, "../../dist/index.html")}`,
  );
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (terminal) terminal.kill();
  language.dispose();
});
ipcMain.handle("project:open", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (r.canceled) return null;
  await language.close();
  if (terminal) {
    terminal.kill();
    terminal = null;
  }
  root = r.filePaths[0];
  return { name: path.basename(root), path: root };
});
registerStorage({ ipcMain, inside });
registerSettings({ app, ipcMain });
ipcMain.handle("terminal:start", async (_event, cols, rows) => {
  if (terminal) terminal.kill();
  const pty = require("node-pty");
  terminal = pty.spawn(process.env.SHELL || "/bin/sh", [], {
    name: "xterm-256color",
    cols: Number.isInteger(cols) && cols > 0 ? cols : 100,
    rows: Number.isInteger(rows) && rows > 0 ? rows : 24,
    cwd: inside(),
    env: process.env,
  });
  terminal.onData((data) => win.webContents.send("terminal:data", data));
  const active = terminal;
  terminal.onExit(() => {
    if (terminal !== active) return;
    terminal = null;
    win.webContents.send("terminal:data", "\r\n[Process exited]\r\n");
  });
  return true;
});
ipcMain.on("terminal:write", (_e, data) => terminal?.write(data));
ipcMain.on("terminal:resize", (_e, cols, rows) => terminal?.resize(cols, rows));
