import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
const api = window.shinba;

export function Term({ enabled, theme }) {
  const element = useRef(null);
  const session = useRef(null);

  useEffect(() => {
    if (!enabled || session.current) return;
    const terminal = new Terminal({
      fontSize: 13,
      fontFamily: '"Hack Nerd Font Mono", Menlo, Monaco, monospace',
      lineHeight: 1.15,
      theme: {
        background: theme.colors["terminal.background"],
        foreground: theme.colors["terminal.foreground"],
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element.current);
    fit.fit();
    const unsubscribe = api.onTerminal((data) => terminal.write(data));
    terminal.onData((data) => api.terminalWrite(data));
    const resize = new ResizeObserver(() => {
      if (element.current?.offsetWidth && element.current?.offsetHeight) {
        fit.fit();
        api.terminalResize(terminal.cols, terminal.rows);
      }
    });
    resize.observe(element.current);
    const current = { terminal, fit, unsubscribe, resize };
    session.current = current;
    api
      .terminalStart(terminal.cols, terminal.rows)
      .then(() => {
        if (session.current === current)
          api.terminalResize(terminal.cols, terminal.rows);
      })
      .catch((error) => terminal.writeln("\r\n" + error.message));
  }, [enabled]);

  useEffect(() => {
    if (session.current)
      session.current.terminal.options.theme = {
        background: theme.colors["terminal.background"],
        foreground: theme.colors["terminal.foreground"],
      };
  }, [theme]);

  useEffect(() => {
    if (!enabled || !session.current) return;
    const { terminal, fit } = session.current;
    requestAnimationFrame(() => {
      if (element.current?.offsetWidth && element.current?.offsetHeight) {
        fit.fit();
        api.terminalResize(terminal.cols, terminal.rows);
        terminal.focus();
      }
    });
  }, [enabled]);

  useEffect(
    () => () => {
      if (!session.current) return;
      session.current.resize.disconnect();
      session.current.unsubscribe();
      session.current.terminal.dispose();
      session.current = null;
    },
    [],
  );

  return (
    <div
      className="terminal"
      ref={element}
      style={{ display: enabled ? "block" : "none" }}
    />
  );
}
