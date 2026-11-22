// npm can unpack the prebuilt helper without executable permissions on macOS.
const fs = require("node:fs");
const path = require("node:path");
if (process.platform === "darwin") {
  const helper = path.join(
    __dirname,
    "..",
    "node_modules",
    "node-pty",
    "prebuilds",
    `darwin-${process.arch}`,
    "spawn-helper",
  );
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
