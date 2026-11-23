import React, { forwardRef, useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { canNestInIndex, createHierarchyIndex } from '../shared/cardHierarchy.mjs';
import { nodeTypes } from './Card.jsx';

function useCardNodes(nodes, { mode, busy, overview, onEditBlur, update, link, openLink, reparent, openMarkdownLink }) {
  const hierarchy = useMemo(() => {
    const byId=createHierarchyIndex(nodes), children=new Map(), result=new Map();
    for (const node of nodes) if (node.parentId) {
      const siblings=children.get(node.parentId) || [];
      siblings.push(node); children.set(node.parentId,siblings);
    }
    for (const node of nodes) {
      const nested=children.get(node.id) || [];
      result.set(node.id, {
        hasChildren:nested.length>0,
        minWidth:Math.max(180,...nested.map(child=>child.position.x+(child.measured?.width ?? child.width ?? child.style?.width ?? 260)+20)),
        minHeight:Math.max(100,...nested.map(child=>child.position.y+(child.measured?.height ?? child.height ?? child.style?.height ?? 200)+20)),
        parentOptions:mode==='insert' ? nodes.filter(candidate=>candidate.id!==node.id && canNestInIndex(byId,node.id,candidate.id)) : [],
      });
    }
    return result;
  }, [nodes,mode]);
  return useMemo(() => nodes.map(node => ({
    ...node,
    ...(node.parentId ? {extent:'parent'} : {}),
    data:{
      ...node.data, ...hierarchy.get(node.id), editing:mode==='insert', busy, overview,
      openMarkdownLink, onEditBlur, update, link, openLink, reparent, parentId:node.parentId,
    },
  })), [nodes,hierarchy,mode,busy,overview,onEditBlur,update,link,openLink,reparent,openMarkdownLink]);
}

export const BoardView = forwardRef(function BoardView({ project, visible, onFocus, board, mode, command, setCommand,
  runCommand, addCard, layout, changeLayout, theme, onFlow, overview, onOverview,
  update, link, openLink, reparent, openMarkdownLink, onEditBlur, onMessage }, ref) {
  const {nodes,edges,setNodes,setEdges}=board;
  const shown=useCardNodes(nodes,{mode,busy:board.busy,overview,onEditBlur,update,link,openLink,reparent,openMarkdownLink});
  return <div className="content" ref={ref} onPointerDownCapture={onFocus} onFocusCapture={onFocus}
    style={{display:visible?'block':'none'}}>
    {project && <>
      <div className="toolbar">
        <span>{mode==='insert' ? 'INSERT (Esc: normal)' : 'NORMAL (i: edit, :w: save)'}</span>
        <button disabled={!board.ready || board.busy} onClick={() => addCard()}>＋ Card</button>
        <button disabled={!board.ready || board.busy} onClick={() => board.commit()}>Save board</button>
        <button disabled={!board.ready || board.busy} onClick={board.check}>Check updates</button>
        <button aria-pressed={layout.boardMinimap} onClick={() => changeLayout({boardMinimap:!layout.boardMinimap})}>Minimap {layout.boardMinimap?'on':'off'}</button>
        <span>{board.dirty ? 'Draft has unpublished changes' : 'Board up to date'}{board.draftStatus==='pending'||board.draftStatus==='saving' ? ' · Saving draft…' : ''}</span>
        {board.draftStatus==='error' && <button onClick={board.retry}>Retry draft save</button>}
        {board.external && <span role="status">Board changed externally; your draft is preserved.</span>}
        {command!==null && <label className="board-command">:
          <input autoFocus value={command} aria-label="Board command" onChange={event=>setCommand(event.target.value)}
            onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();runCommand(command);} else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setCommand(null);}}} />
        </label>}
      </div>
      <ReactFlow onInit={instance=>{onFlow(instance);onOverview(instance.getZoom()<0.3);}}
        onMove={(_event,viewport)=>onOverview(viewport.zoom<0.3)} minZoom={0.005} maxZoom={4}
        fitViewOptions={{minZoom:0.005,maxZoom:1}} nodesDraggable={!board.busy && board.ready}
        nodesConnectable={!board.busy && board.ready} elementsSelectable={!board.busy && board.ready}
        nodes={shown} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={changes=>setNodes(current=>applyNodeChanges(changes,current))}
        onEdgesChange={changes=>setEdges(current=>applyEdgeChanges(changes,current))}
        onConnect={connection=>setEdges(current=>addEdge(connection,current))}
        onBeforeDelete={async ({nodes:toDelete})=>{
          const ids=new Set(toDelete.map(node=>node.id));
          if(nodes.some(node=>node.parentId && ids.has(node.parentId))){onMessage('Remove nested cards from their parent before deleting it.');return false;}
          return true;
        }} fitView>
        <Background color={theme.grid} /><Controls />
        {layout.boardMinimap && <MiniMap pannable zoomable ariaLabel="Board minimap" nodeColor={theme.colors.focusBorder}
          maskColor={theme.monaco==='vs-dark' ? '#0009' : '#ffffff99'} />}
      </ReactFlow>
    </>}
  </div>;
});
