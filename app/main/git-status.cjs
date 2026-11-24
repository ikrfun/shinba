const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs/promises');
const run = promisify(execFile);

async function git(root, ...args) {
  const { stdout } = await run('git', ['-C', root, '--no-optional-locks', ...args], { maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', timeout: 15000 });
  return stdout;
}
function projectPath(project, repo, name) {
  const relative = path.relative(project, path.join(repo, name));
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? relative : null;
}
function ranges(diff) {
  return [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map(match => {
    const start = Math.max(0, Number(match[1]) - 1);
    return { start, end: start + Math.max(1, Number(match[2] ?? 1)) - 1 };
  });
}
async function status(project) {
  project = await fs.realpath(project);
  let repo;
  try { repo = (await git(project, 'rev-parse', '--show-toplevel')).trim(); }
  catch (error) { if (error.code === 128) return { available: false, upstream: false, files: {} }; throw error; }
  const files = {};
  const parts = (await git(project, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.')).split('\0');
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]; if (!entry) continue;
    const name = projectPath(project, repo, entry.slice(3));
    if (name) files[name] = { ...files[name], modified: true };
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') {
      const previous = projectPath(project, repo, parts[++i]);
      if (previous) files[previous] = { ...files[previous], modified: true };
    }
  }
  const ignored = (await git(project, 'ls-files', '--full-name', '--others', '--ignored', '--exclude-standard', '--directory', '-z', '--', '.')).split('\0');
  for (const name of ignored) {
    const relative = name && projectPath(project, repo, name.replace(/\/$/, ''));
    if (relative) files[relative] = { ...files[relative], ignored: true };
  }
  let upstream = false;
  try { await git(project, 'rev-parse', '--verify', '@{upstream}'); upstream = true; }
  catch (error) { if (error.code !== 128) throw error; }
  if (upstream) {
    const names = (await git(project, 'diff', '--name-only', '-z', '--no-renames', '@{upstream}...HEAD', '--', '.')).split('\0');
    for (const name of names) { const relative = name && projectPath(project, repo, name); if (relative) files[relative] = { ...files[relative], unpushed: true }; }
  }
  return { available: true, upstream, files };
}
async function fileRanges(project, file, state) {
  if (typeof file !== 'string' || path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error('Invalid project path');
  const result = { modified: [], unpushed: [] };
  if (state.modified) {
    try { result.modified = ranges(await git(project, 'diff', '--no-ext-diff', '--no-color', '--unified=0', 'HEAD', '--', file)); }
    catch (error) {
      if (error.code !== 128) throw error;
      result.modified = [{ start: 0, end: Number.MAX_SAFE_INTEGER }];
    }
    if (!result.modified.length) {
      const tracked = await git(project, 'ls-files', '--', file);
      if (!tracked.trim()) result.modified = [{ start: 0, end: Number.MAX_SAFE_INTEGER }];
    }
  }
  // HEAD line numbers may have moved in the working tree, so avoid claiming a
  // precise unpushed symbol when the same file also has uncommitted changes.
  if (state.unpushed && !state.modified) result.unpushed = ranges(await git(project, 'diff', '--no-ext-diff', '--no-color', '--unified=0', '@{upstream}...HEAD', '--', file));
  return result;
}
module.exports = { status, fileRanges, ranges };
