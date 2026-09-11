import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Excalidraw's bottom-left footer row, where the zoom and undo/redo islands sit
 * side by side. Portalling into it puts our island in the same flex row, so it
 * inherits Excalidraw's spacing, theme variables and responsive behaviour
 * instead of being pinned to hardcoded coordinates.
 *
 * It is an internal selector, so a missing node is handled rather than assumed:
 * the button then falls back to a fixed island in the same corner.
 */
const FOOTER_ROW = ".layer-ui__wrapper__footer-left section";

function useFooterRow(): Element | null {
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    const found = document.querySelector(FOOTER_ROW);
    if (found) {
      setHost(found);
      return;
    }
    // Excalidraw mounts its UI after ours, so wait for the row to appear.
    const observer = new MutationObserver(() => {
      const row = document.querySelector(FOOTER_ROW);
      if (row) {
        setHost(row);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return host;
}

const GridIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
);

type Props = {
  enabled: boolean;
  onToggle: () => void;
};

export function GridToggle({ enabled, onToggle }: Props) {
  const host = useFooterRow();

  const island = (
    <div
      className={`udraw-grid-toggle${host ? "" : " udraw-grid-toggle--detached"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={enabled}
        className={enabled ? "udraw-grid-toggle__button is-active" : "udraw-grid-toggle__button"}
        title={`${enabled ? "Ocultar" : "Mostrar"} grade — Ctrl+'`}
        aria-label={`${enabled ? "Ocultar" : "Mostrar"} grade`}
      >
        <GridIcon />
      </button>
    </div>
  );

  return host ? createPortal(island, host) : island;
}
