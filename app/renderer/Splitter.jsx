import React, { useEffect, useRef } from 'react';

export function Splitter({ direction, value, min, max, onChange, onCommit, label }) {
  const drag = useRef(null), latest = useRef(null);
  latest.current = { direction, min, max, onChange, onCommit };
  const clamp = next => Math.round(Math.max(min, Math.min(max, next)));
  useEffect(() => {
    const move = event => {
      if (!drag.current || event.pointerId !== drag.current.pointerId) return;
      const { direction, min, max, onChange } = latest.current;
      const coordinate = direction === 'vertical' ? event.clientX : event.clientY;
      const sign = direction === 'vertical' ? 1 : -1;
      drag.current.last = Math.round(Math.max(min, Math.min(max, drag.current.value + sign * (coordinate - drag.current.start))));
      onChange(drag.current.last);
    };
    const finish = event => {
      if (!drag.current || event.pointerId !== drag.current.pointerId) return;
      const last = drag.current.last;
      drag.current = null;
      latest.current.onCommit(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, []);
  return <div className={`splitter splitter-${direction}`} role="separator" tabIndex={0} aria-label={label}
    aria-orientation={direction} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag.current={start:direction === 'vertical' ? event.clientX : event.clientY,value,last:value,pointerId:event.pointerId};
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onKeyDown={event => {
      const amount = event.shiftKey ? 50 : 10;
      let next = value;
      if (event.key === 'Home') next=min;
      else if (event.key === 'End') next=max;
      else if (direction === 'vertical' && event.key === 'ArrowLeft') next=value-amount;
      else if (direction === 'vertical' && event.key === 'ArrowRight') next=value+amount;
      else if (direction === 'horizontal' && event.key === 'ArrowUp') next=value+amount;
      else if (direction === 'horizontal' && event.key === 'ArrowDown') next=value-amount;
      else return;
      event.preventDefault(); next=clamp(next); onChange(next); onCommit(next);
    }} />;
}
