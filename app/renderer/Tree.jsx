import React, { useEffect, useState } from "react";
import "@vscode/codicons/dist/codicon.css";
import { entryDecoration, symbolDecoration, decorationLabel } from './treeDecorations.js';

const api = window.shinba;
const supportsSymbols = (path) => /\.(ts|tsx|js|jsx|cjs|mjs)$/.test(path);
const symbolIcons = {
  1: "symbol-file",
  2: "symbol-module",
  3: "symbol-namespace",
  4: "symbol-package",
  5: "symbol-class",
  6: "symbol-method",
  7: "symbol-property",
  8: "symbol-field",
  9: "symbol-constructor",
  10: "symbol-enum",
  11: "symbol-interface",
  12: "symbol-function",
  13: "symbol-variable",
  14: "symbol-constant",
  15: "symbol-string",
  16: "symbol-number",
  17: "symbol-boolean",
  18: "symbol-array",
  19: "symbol-object",
  20: "symbol-key",
  21: "symbol-null",
  22: "symbol-enum-member",
  23: "symbol-struct",
  24: "symbol-event",
  25: "symbol-operator",
  26: "symbol-type-parameter",
};
const symbolNames = {
  5: "Class",
  6: "Method",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  23: "Struct",
};

function Icon({ name, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`codicon codicon-${name} ${className}`}
    />
  );
}
function fileIcon(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".txt")) return "book";
  if (lower.endsWith(".json")) return "json";
  if (/\.(js|jsx|ts|tsx|cjs|mjs|html|css|py|rs)$/.test(lower))
    return "file-code";
  return "file";
}

// Collapse a chain only while each directory contains one directory and no files.
async function compactDirectory(entry) {
  if (!entry.directory) return entry;
  let path = entry.path;
  let name = entry.name;
  const seen = new Set([path]);
  for (let i = 0; i < 32; i++) {
    let children;
    try {
      children = await api.tree(path);
    } catch {
      break;
    }
    if (
      children.length !== 1 ||
      !children[0].directory ||
      seen.has(children[0].path)
    )
      break;
    path = children[0].path;
    name += ` / ${children[0].name}`;
    seen.add(path);
  }
  return { ...entry, path, name };
}

function Symbols({ items, file, onSymbol, selectedSymbol, ranges }) {
  return (
    <ul className="tree-children">
      {items.map((item, index) => {
        const type = symbolNames[item.kind] || "Symbol";
        const range = item.selectionRange || item.range || item.location?.range;
        const selected =
          selectedSymbol?.path === file &&
          selectedSymbol?.name === item.name &&
          selectedSymbol?.range?.start?.line === range?.start?.line;
        const state = symbolDecoration(ranges, item);
        return (
          <li key={`${item.name}-${index}`}>
            <button
              className={`tree-row symbol-row${selected ? " is-selected" : ""}`}
              data-decoration={state}
              onClick={() => onSymbol(file, item)}
              title={`${type}: ${item.name}${state ? ` — ${decorationLabel[state]}` : ''}`}
            >
              <span className="tree-expander" />
              <Icon
                name={symbolIcons[item.kind] || "symbol-misc"}
                className="symbol-icon"
              />
              <span className="tree-label">{item.name}</span>
            </button>
            {item.children?.length > 0 && (
              <Symbols
                items={item.children}
                file={file}
                onSymbol={onSymbol}
                selectedSymbol={selectedSymbol}
                ranges={ranges}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TreeEntries({
  path = "",
  onFile,
  onSymbol,
  refresh,
  selectedFile,
  selectedSymbol,
  git,
}) {
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [symbols, setSymbols] = useState({});
  const [errors, setErrors] = useState({});
  const [diffRanges, setDiffRanges] = useState({});
  useEffect(() => {
    let alive = true;
    for (const file of Object.keys(expanded)) {
      if (!expanded[file] || !symbols[file]) continue;
      const state = git.files?.[file] || {};
      if (!state.modified && !state.unpushed) { setDiffRanges(current => ({ ...current, [file]: {} })); continue; }
      api.gitFileRanges(file, state).then(result => { if (alive) setDiffRanges(current => ({ ...current, [file]: result })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [expanded, symbols, git]);
  useEffect(() => {
    let active = true;
    api
      .tree(path)
      .then((items) => Promise.all(items.map(compactDirectory)))
      .then((items) => {
        if (active) setEntries(items);
      })
      .catch((error) => {
        if (active)
          setErrors((state) => ({ ...state, directory: error.message }));
      });
    return () => {
      active = false;
    };
  }, [path, refresh]);
  const toggle = async (entry) => {
    const opening = !expanded[entry.path];
    setExpanded((state) => ({ ...state, [entry.path]: opening }));
    if (entry.directory) return;
    onFile(entry.path);
    if (!opening || !supportsSymbols(entry.path)) return;
    try {
      const text = await api.read(entry.path);
      const result = await api.symbols(entry.path, text);
      setSymbols((state) => ({ ...state, [entry.path]: result }));
      setErrors((state) => ({ ...state, [entry.path]: null }));
    } catch (error) {
      setErrors((state) => ({ ...state, [entry.path]: error.message }));
    }
  };
  return (
    <ul className={path ? "tree-children" : "tree-root"}>
      {errors.directory && <li className="tree-error">{errors.directory}</li>}
      {entries.map((entry) => {
        const isOpen = Boolean(expanded[entry.path]);
        const expandable = entry.directory || supportsSymbols(entry.path);
        const state = entryDecoration(git.files, entry);
        return (
          <li key={entry.path}>
            <button
              className={`tree-row${!entry.directory && selectedFile === entry.path ? " is-selected" : ""}`}
              data-decoration={state}
              onClick={() => toggle(entry)}
              title={`${entry.path}${state ? ` — ${decorationLabel[state]}` : ''}`}
              aria-expanded={expandable ? isOpen : undefined}
            >
              <span className="tree-expander">
                {expandable && (
                  <Icon name={isOpen ? "chevron-down" : "chevron-right"} />
                )}
              </span>
              <Icon
                name={
                  entry.directory
                    ? isOpen
                      ? "folder-opened"
                      : "folder"
                    : fileIcon(entry.name)
                }
                className={entry.directory ? "folder-icon" : "file-icon"}
              />
              <span className="tree-label">{entry.name}</span>
            </button>
            {isOpen &&
              (entry.directory ? (
                <TreeEntries
                  path={entry.path}
                  onFile={onFile}
                  onSymbol={onSymbol}
                  refresh={refresh}
                  selectedFile={selectedFile}
                  selectedSymbol={selectedSymbol}
                  git={git}
                />
              ) : (
                <>
                  {errors[entry.path] && (
                    <div className="tree-error">{errors[entry.path]}</div>
                  )}
                  {symbols[entry.path]?.length > 0 && (
                    <Symbols
                      items={symbols[entry.path]}
                      file={entry.path}
                      onSymbol={onSymbol}
                      selectedSymbol={selectedSymbol}
                      ranges={diffRanges[entry.path]}
                    />
                  )}
                </>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

export function Tree(props) {
  const [git, setGit] = useState({ files: {} });
  useEffect(() => {
    let active = true, running = false;
    const refreshGit = async () => {
      if (running) return;
      running = true;
      try {
        const next = await api.gitStatus();
        if (active) setGit(next);
      } catch { if (active) setGit(current => current.error ? current : { available: false, error: true, files: {} }); }
      finally { running = false; }
    };
    refreshGit();
    const timer = setInterval(refreshGit, 5000);
    window.addEventListener('focus', refreshGit);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refreshGit); };
  }, [props.refresh]);
  return <>
    {git.available && !git.upstream && <div className="tree-git-note">Git: no upstream branch; unpushed changes unavailable</div>}
    {git.error && <div className="tree-git-note">Git status unavailable</div>}
    <TreeEntries {...props} git={git} />
  </>;
}
