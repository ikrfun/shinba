// Card shape shared by the command line and board UI. Coordinates are board
// coordinates for top-level cards and parent-relative coordinates for children.
export function createCard({ id, title = 'New card', body = '', x = 80, y = 80, parentId, templateId, zIndex }) {
  if (typeof id !== 'string' || !id || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('A card needs an ID and finite coordinates');
  return { id, type: 'card', position: { x, y }, data: { title, body, ...(templateId ? { templateId } : {}) },
    ...(parentId ? { parentId } : {}), ...(zIndex === undefined ? {} : { zIndex }), style: { width: 260, height: 200 } };
}

export function updateCardData(nodes, id, patch, { requireExisting = false } = {}) {
  if (requireExisting && !nodes.some(node => node.id === id)) throw new Error(`Card not found: ${id}`);
  return nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node);
}
