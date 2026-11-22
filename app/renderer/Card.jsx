import React from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
export function Card({ id, data, selected }) {
  return (
    <div className={`card${data.hasChildren ? " has-children" : ""}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={data.minWidth}
        minHeight={data.minHeight}
      />
      <Handle type="target" position={Position.Left} />
      <input
        className="nodrag title"
        value={data.title}
        onChange={(e) => data.update(id, { title: e.target.value })}
        placeholder="Card title"
      />
      <textarea
        className="nodrag"
        value={data.body}
        onChange={(e) => data.update(id, { body: e.target.value })}
        placeholder="Enter a description"
      />
      <div className="card-actions">
        <button className="nodrag" onClick={() => data.link(id)}>
          Link selected symbol
        </button>
        {data.codeLink && (
          <button
            className="nodrag"
            onClick={() => data.openLink(data.codeLink)}
          >
            Open code
          </button>
        )}
      </div>
      {data.codeLink && (
        <small>
          {data.codeLink.path} · {data.codeLink.name}
        </small>
      )}
      <label className="card-parent nodrag">
        Parent
        <select
          value={data.parentId || ""}
          onChange={(event) => data.reparent(id, event.target.value)}
          aria-label="Parent card"
        >
          <option value="">None</option>
          {data.parentOptions.map((node) => (
            <option key={node.id} value={node.id}>
              {node.data.title || "Untitled card"}
            </option>
          ))}
        </select>
      </label>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
export const nodeTypes = { card: Card };
