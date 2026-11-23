import React from 'react';

export function WorkspaceTab({ label, active, dirty = false, onSelect, onClose, closeDisabled = false, closeLabel = `Close ${label}`, className = '' }) {
  return <div className={`workspace-tab${className ? ` ${className}` : ''}${active ? ' active' : ''}`}>
    <button className="workspace-tab-label" onClick={onSelect} title={label}>
      {label}{dirty ? ' ●' : ''}
    </button>
    {onClose && <button className="workspace-tab-close" aria-label={closeLabel} title={closeLabel}
      disabled={closeDisabled} onClick={onClose}>×</button>}
  </div>;
}
