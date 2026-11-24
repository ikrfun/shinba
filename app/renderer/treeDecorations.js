// Highest-priority state wins when a row represents multiple sources.
export function decoration(states) {
  if (states?.error) return 'error';
  if (states?.modified) return 'modified';
  if (states?.unpushed) return 'unpushed';
  if (states?.ignored) return 'ignored';
  return undefined;
}
export function entryDecoration(files, entry) {
  const states = {};
  for (const [path, status] of Object.entries(files || {})) {
    if (status.ignored && (entry.path === path || entry.path.startsWith(path + '/'))) states.ignored = true;
    if (path === entry.path || (entry.directory && path.startsWith(entry.path + '/'))) {
      states.modified ||= status.modified;
      states.unpushed ||= status.unpushed;
      states.error ||= status.error;
    }
  }
  return decoration(states);
}
export function symbolDecoration(ranges, item) {
  const range = item.range || item.location?.range || item.selectionRange;
  if (!range) return undefined;
  const intersects = (items = []) => items.some(change => change.start <= range.end.line && change.end >= range.start.line);
  return decoration({ error: intersects(ranges?.error), modified: intersects(ranges?.modified), unpushed: intersects(ranges?.unpushed) });
}
export const decorationLabel = { modified: 'Uncommitted changes', unpushed: 'Unpushed commits', ignored: 'Ignored by Git', error: 'Error' };
