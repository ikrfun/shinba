import { useEffect } from "react";
import { initVimMode } from "monaco-vim";

export function useVim(editor, enabled, statusRef, onError) {
  useEffect(() => {
    if (!editor || !enabled || !statusRef.current) return;
    let vim;
    try {
      vim = initVimMode(editor, statusRef.current);
    } catch (error) {
      onError(`Could not start Vim mode: ${error.message}`);
    }
    return () => {
      vim?.dispose();
      if (statusRef.current) statusRef.current.textContent = "";
    };
  }, [editor, enabled, statusRef, onError]);
}
