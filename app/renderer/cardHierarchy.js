const PADDING = 20;
const CONTENT_TOP = 160;
const GAP = 20;

function dimensions(node) {
  return {
    width: node.measured?.width ?? node.width ?? node.style?.width ?? 260,
    height: node.measured?.height ?? node.height ?? node.style?.height ?? 200,
  };
}

function absolutePosition(node, byId) {
  let x = node.position.x;
  let y = node.position.y;
  const seen = new Set([node.id]);
  let parentId = node.parentId;
  while (parentId) {
    if (seen.has(parentId)) throw new Error("Card hierarchy contains a cycle");
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) throw new Error("Parent card not found");
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

export function canNest(nodes, childId, parentId) {
  if (!parentId) return true;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(childId) || !byId.has(parentId)) return false;
  let current = byId.get(parentId);
  const seen = new Set();
  while (current) {
    if (current.id === childId || seen.has(current.id)) return false;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return true;
}

export function reparentCard(nodes, childId, parentId) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const child = byId.get(childId);
  if (!child || !canNest(nodes, childId, parentId))
    throw new Error("Invalid card parent");
  if ((child.parentId || "") === (parentId || "")) return nodes;
  const absolute = absolutePosition(child, byId);
  let newPosition = absolute;
  const updated = new Map(nodes.map((node) => [node.id, node]));
  if (parentId) {
    const parent = byId.get(parentId);
    const siblings = nodes.filter(
      (node) => node.parentId === parentId && node.id !== childId,
    );
    const y = siblings.reduce(
      (bottom, node) =>
        Math.max(bottom, node.position.y + dimensions(node).height + GAP),
      CONTENT_TOP,
    );
    newPosition = { x: PADDING, y };
    const childSize = dimensions(child);
    // Grow every ancestor so that nested contents remain visible after reparenting.
    let requiredWidth = newPosition.x + childSize.width + PADDING;
    let requiredHeight = newPosition.y + childSize.height + PADDING;
    let current = parent;
    while (current) {
      const size = dimensions(current);
      const width = Math.max(size.width, requiredWidth);
      const height = Math.max(size.height, requiredHeight);
      updated.set(current.id, {
        ...current,
        style: { ...current.style, width, height },
        width,
        height,
      });
      requiredWidth = current.position.x + width + PADDING;
      requiredHeight = current.position.y + height + PADDING;
      current = current.parentId ? byId.get(current.parentId) : null;
    }
  }
  const { parentId: _oldParent, extent: _extent, ...rest } = child;
  updated.set(childId, {
    ...rest,
    position: newPosition,
    ...(parentId ? { parentId } : {}),
  });
  // React Flow 12 requires ancestors to occur before descendants.
  const result = [];
  const visited = new Set();
  function append(node) {
    if (visited.has(node.id)) return;
    if (node.parentId) {
      const parent = updated.get(node.parentId);
      if (!parent) throw new Error("Parent card not found");
      append(parent);
    }
    visited.add(node.id);
    result.push(node);
  }
  for (const node of nodes) append(updated.get(node.id));
  return result;
}
