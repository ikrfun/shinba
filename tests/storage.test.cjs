const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { registerStorage } = require("../app/main/storage.cjs");
test("rejects changed files and preserves external edits", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shinba-storage-"));
  try {
    const handlers = {};
    registerStorage({
      ipcMain: {
        handle: (name, fn) => {
          handlers[name] = fn;
        },
      },
      inside: (p = '') => path.resolve(dir, p),
    });
    await fs.writeFile(path.join(dir, "test.txt"), "external");
    await assert.rejects(
      handlers["file:write"](null, "test.txt", "local", "original"),
      /changed externally/,
    );
    await fs.writeFile(path.join(dir, 'pixel.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    assert.match(await handlers['file:read-image'](null, 'pixel.png'), /^data:image\/png;base64,/);
    await assert.rejects(handlers['file:read-image'](null, '../outside.png'));
    await assert.rejects(handlers['file:read-image'](null, 'test.txt'), /Unsupported image format/);
    assert.equal(
      await fs.readFile(path.join(dir, "test.txt"), "utf8"),
      "external",
    );
    await handlers["file:write"](null, "test.txt", "local", "external");
    assert.equal(
      await fs.readFile(path.join(dir, "test.txt"), "utf8"),
      "local",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
