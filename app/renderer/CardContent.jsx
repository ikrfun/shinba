import React from 'react';
import { MarkdownCard } from './MarkdownCard.jsx';

function CardBody({ id, data }) {
  if (data.editing) return <textarea className="nodrag" disabled={data.busy} onBlur={data.onEditBlur}
    value={data.body} onChange={event => data.update(id, {body:event.target.value})} placeholder="Enter a description" />;
  if (data.templateId === 'html') return <iframe className="card-html-preview" title={`${data.title || 'Untitled'} preview`} sandbox=""
    srcDoc={'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' + (data.body || '')} />;
  return <MarkdownCard text={data.body} onLink={data.openMarkdownLink} />;
}
export function CardContent({ id, data }) {
  return <>
    {data.editing ? <input className="nodrag title" disabled={data.busy} onBlur={data.onEditBlur}
      value={data.title} onChange={event => data.update(id, {title:event.target.value})} placeholder="Card title" />
      : <div className="title card-view-title">{data.title || 'Untitled card'}</div>}
    <CardBody id={id} data={data} />
    <div className="card-actions">
      {data.editing && <button disabled={data.busy} className="nodrag" onClick={() => data.link(id)}>Link selected symbol</button>}
      {data.codeLink && <button className="nodrag" onClick={() => data.openLink(data.codeLink)}>Open code</button>}
    </div>
    {data.codeLink && <small>{data.codeLink.path} · {data.codeLink.name}</small>}
    {data.editing && <label className="card-parent nodrag">Parent
      <select disabled={data.busy} onBlur={data.onEditBlur} value={data.parentId || ''}
        onChange={event => data.reparent(id,event.target.value)} aria-label="Parent card">
        <option value="">None</option>
        {data.parentOptions.map(node => <option key={node.id} value={node.id}>{node.data.title || 'Untitled card'}</option>)}
      </select>
    </label>}
  </>;
}
