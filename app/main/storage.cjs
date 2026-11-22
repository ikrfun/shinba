const fs = require("node:fs/promises");
const path = require("node:path");
function registerStorage({ ipcMain, inside }) {
  ipcMain.handle("project:tree", async (_e, dir = "") => {
    const entries = await fs.readdir(inside(dir), { withFileTypes: true });
    return entries
      .filter((x) => x.name !== ".git" && !x.isSymbolicLink())
      .sort(
        (a, b) =>
          Number(b.isDirectory()) - Number(a.isDirectory()) ||
          a.name.localeCompare(b.name),
      )
      .map((x) => ({
        name: x.name,
        path: path.join(dir, x.name),
        directory: x.isDirectory(),
      }));
  });
  ipcMain.handle("file:read", async (_e, file) =>
    fs.readFile(inside(file), "utf8"),
  );
  ipcMain.handle("file:write", async (_e, file, text, expected) => {
    const target = inside(file);
    const current = await fs.readFile(target, "utf8");
    if (current !== expected)
      throw new Error("The file was changed externally. Saving was stopped.");
    await fs.writeFile(target, text, "utf8");
  });
  ipcMain.handle("board:load", async () => {
    const p = inside(".shinba/boards/main.json");
    try {
      return JSON.parse(await fs.readFile(p, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  });
  ipcMain.handle("board:save", async (_e, data, expected) => {
    const dir = inside(".shinba/boards"),
      p = path.join(dir, "main.json");
    await fs.mkdir(dir, { recursive: true });
    let current = null;
    try {
      current = JSON.parse(await fs.readFile(p, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if ((current?.revision ?? 0) !== expected)
      throw new Error(
        "The board was changed externally. Reload it before saving.",
      );
    const next = { ...data, schemaVersion: 1, revision: expected + 1 };
    const tmp = p + "." + process.pid + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n");
    await fs.rename(tmp, p);
    return next;
  });
}
module.exports = { registerStorage };
