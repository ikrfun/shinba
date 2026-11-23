import React, { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function MarkdownCard({ text, onLink }) {
  const container = useRef(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text || '', { gfm: true, breaks: true }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
  }), [text]);
  useEffect(() => {
    let active = true;
    const root = container.current;
    for (const image of root?.querySelectorAll('img[src]') || []) {
      const src = image.getAttribute('src');
      if (!src || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src)) continue;
      try {
        const local = decodeURIComponent(src.split(/[?#]/)[0]);
        window.shinba.readImage(local).then(data => { if (data && active && root.contains(image)) image.src = data; }).catch(() => {});
      } catch { /* Leave an invalid image URL unmodified. */ }
    }
    return () => { active = false; };
  }, [html]);
  return <div ref={container} className="card-view-body markdown-card" onClick={event => {
    const link = event.target.closest?.('a');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href');
    if (href) onLink(href);
  }} dangerouslySetInnerHTML={{ __html: html }} />;
}
