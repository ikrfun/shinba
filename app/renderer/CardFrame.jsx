import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';

// Keep handles mounted when the card switches to the zoomed-out outline.
export function CardFrame({ data, selected, children }) {
  return <div className={`card${data.hasChildren ? ' has-children' : ''}${data.overview ? ' card-overview' : ''}`}
    aria-label={data.overview ? (data.title || 'Card') : undefined}>
    <NodeResizer isVisible={selected && !data.busy && !data.overview} minWidth={data.minWidth} minHeight={data.minHeight} />
    <Handle key="target" type="target" position={Position.Left} />
    {!data.overview && children}
    <Handle key="source" type="source" position={Position.Right} />
  </div>;
}
