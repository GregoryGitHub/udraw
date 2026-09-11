import { exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { convertMermaid, insertMermaidDiagram } from "./insert";

const PREVIEW_DEBOUNCE_MS = 300;

const TEMPLATES: { label: string; source: string }[] = [
  {
    label: "Fluxograma",
    source: `flowchart TD
  A[Início] --> B{Deu certo?}
  B -- Sim --> C[Seguir em frente]
  B -- Não --> D[Corrigir]
  D --> B`,
  },
  {
    label: "Sequência",
    source: `sequenceDiagram
  participant Usuário
  participant App
  Usuário->>App: Abrir desenho
  App-->>Usuário: Cena carregada`,
  },
  {
    label: "Classes",
    source: `classDiagram
  class Documento {
    +String caminho
    +salvar()
  }
  class Cena
  Documento --> Cena`,
  },
  {
    label: "ER",
    source: `erDiagram
  DESENHO ||--o{ ELEMENTO : contém
  ELEMENTO {
    string id
    string tipo
  }`,
  },
  {
    label: "Estados",
    source: `stateDiagram-v2
  [*] --> Rascunho
  Rascunho --> Salvo: salvar
  Salvo --> Rascunho: editar
  Salvo --> [*]`,
  },
];

type Props = {
  api: ExcalidrawImperativeAPI;
  onClose: () => void;
  onInserted: (message: string) => void;
};

export function MermaidPanel({ api, onClose, onInserted }: Props) {
  const [source, setSource] = useState(TEMPLATES[0].source);
  const [error, setError] = useState<string | null>(null);
  const [asImage, setAsImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Preview renders through exportToSvg so it shows the real rough.js output,
  // not mermaid's own SVG - what you see is what lands on the canvas.
  useEffect(() => {
    let cancelled = false;
    const host = previewRef.current;
    if (!host) {
      return;
    }
    if (!source.trim()) {
      host.replaceChildren();
      setError(null);
      setAsImage(false);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const conversion = await convertMermaid(source);
          if (cancelled) {
            return;
          }
          setAsImage(conversion.rendersAsImage);
          if (!conversion.elements.length) {
            setError("O diagrama não gerou nenhum elemento.");
            host.replaceChildren();
            return;
          }
          const svg = await exportToSvg({
            elements: conversion.elements,
            appState: { exportBackground: false, exportScale: 1 },
            files: conversion.files,
            exportPadding: 12,
          });
          if (cancelled) {
            return;
          }
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.style.maxWidth = "100%";
          svg.style.maxHeight = "100%";
          host.replaceChildren(svg);
          setError(null);
        } catch (cause) {
          if (cancelled) {
            return;
          }
          host.replaceChildren();
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source]);

  const insert = useCallback(async () => {
    setBusy(true);
    try {
      const result = await insertMermaidDiagram(api, source);
      onInserted(
        result.rendersAsImage
          ? "Diagrama inserido como imagem."
          : `Diagrama inserido: ${result.count} elementos.`,
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [api, onClose, onInserted, source]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !error) {
      event.preventDefault();
      void insert();
    }
  };

  return (
    <div className="udraw-dialog__backdrop" role="dialog" aria-modal="true" onKeyDown={onKeyDown}>
      <div className="udraw-mermaid">
        <header className="udraw-mermaid__header">
          <h2>Inserir diagrama Mermaid</h2>
          <p>
            O diagrama vira elementos normais do desenho. O código não é guardado:
            depois de inserir, edite como qualquer outro desenho.
          </p>
        </header>

        <div className="udraw-mermaid__templates">
          {TEMPLATES.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => setSource(template.source)}
            >
              {template.label}
            </button>
          ))}
        </div>

        <div className="udraw-mermaid__body">
          <textarea
            ref={textareaRef}
            className="udraw-mermaid__code"
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            aria-label="Código Mermaid"
          />
          <div className="udraw-mermaid__preview" ref={previewRef} />
        </div>

        {asImage && !error ? (
          <p className="udraw-mermaid__warning">
            Este tipo de diagrama não tem conversor nativo: ele será inserido como uma
            única <strong>imagem</strong>, e não como formas editáveis. Tipos com suporte
            completo: flowchart, sequenceDiagram, classDiagram, erDiagram e stateDiagram.
          </p>
        ) : null}
        {error ? <p className="udraw-mermaid__error">{error}</p> : null}

        <div className="udraw-dialog__actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="udraw-dialog__primary"
            disabled={busy || !!error || !source.trim()}
            onClick={() => void insert()}
          >
            Inserir
          </button>
        </div>
      </div>
    </div>
  );
}
