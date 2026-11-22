const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} = require("vscode-jsonrpc/node");
function createLanguageService({ app, ipcMain, getRoot, inside }) {
  let lsp = null,
    lspRoot = null;
  const versions = new Map();
  function uri(file) {
    return pathToFileURL(inside(file)).toString();
  }
  async function closeLsp() {
    if (!lsp) return;
    const old = lsp;
    lsp = null;
    lspRoot = null;
    versions.clear();
    try {
      await old.sendRequest("shutdown");
      old.sendNotification("exit");
    } catch {}
    old.dispose();
  }
  async function getLsp() {
    const root = getRoot();
    if (lsp && lspRoot === root) return lsp;
    if (!root) throw new Error("Open a project folder first");
    const server = path.join(
      app.getAppPath(),
      "node_modules",
      "typescript-language-server",
      "lib",
      "cli.mjs",
    );
    const child = spawn(process.execPath, [server, "--stdio"], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const conn = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );
    child.stderr.on("data", () => {});
    child.on("exit", () => {
      if (lsp === conn) {
        lsp = null;
        lspRoot = null;
        versions.clear();
      }
    });
    conn.onRequest("workspace/configuration", (p) => p.items.map(() => null));
    conn.onRequest("client/registerCapability", () => null);
    conn.onNotification("textDocument/publishDiagnostics", () => {});
    conn.listen();
    const result = await conn.sendRequest("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).toString(),
      initializationOptions: {
        tsserver: {
          fallbackPath: path.join(
            app.getAppPath(),
            "node_modules",
            "typescript",
            "lib",
          ),
        },
      },
      capabilities: {
        workspace: { configuration: true },
        textDocument: {
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        },
      },
    });
    conn.sendNotification("initialized", {});
    conn.capabilities = result.capabilities;
    lsp = conn;
    lspRoot = root;
    return conn;
  }
  async function sync(file, text) {
    const c = await getLsp();
    const u = uri(file),
      ver = versions.get(u);
    if (ver === undefined) {
      c.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: u,
          languageId: /\.(js|jsx|cjs|mjs)$/.test(file)
            ? "javascript"
            : "typescript",
          version: 1,
          text,
        },
      });
      versions.set(u, 1);
    } else {
      c.sendNotification("textDocument/didChange", {
        textDocument: { uri: u, version: ver + 1 },
        contentChanges: [{ text }],
      });
      versions.set(u, ver + 1);
    }
    return c;
  }

  ipcMain.handle("lsp:sync", async (_e, file, text) => {
    if (!/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(file)) return false;
    await sync(file, text);
    return true;
  });
  ipcMain.handle("lsp:symbols", async (_e, file, text) => {
    if (!/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(file)) return [];
    const c = await sync(file, text);
    if (!c.capabilities.documentSymbolProvider) return [];
    return (
      (await c.sendRequest("textDocument/documentSymbol", {
        textDocument: { uri: uri(file) },
      })) || []
    );
  });
  ipcMain.handle("lsp:definition", async (_e, file, text, position) => {
    const c = await sync(file, text);
    if (!c.capabilities.definitionProvider) return [];
    const result = await c.sendRequest("textDocument/definition", {
      textDocument: { uri: uri(file) },
      position,
    });
    return result ? (Array.isArray(result) ? result : [result]) : [];
  });

  return { close: closeLsp, dispose: () => lsp?.dispose() };
}
module.exports = { createLanguageService };
