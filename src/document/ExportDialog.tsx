import { useState } from "react";

import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportFormat,
  type ExportOptions,
} from "./exporters";

type Props = {
  format: ExportFormat;
  hasSelection: boolean;
  onCancel: () => void;
  onConfirm: (options: ExportOptions) => void;
};

const SCALES = [1, 2, 3];

export function ExportDialog({ format, hasSelection, onCancel, onConfirm }: Props) {
  const [scale, setScale] = useState(DEFAULT_EXPORT_OPTIONS.scale);
  const [withBackground, setWithBackground] = useState(
    DEFAULT_EXPORT_OPTIONS.withBackground,
  );
  const [selectionOnly, setSelectionOnly] = useState(hasSelection);

  return (
    <div className="udraw-dialog__backdrop" role="dialog" aria-modal="true">
      <div className="udraw-dialog">
        <h2>Exportar {format.toUpperCase()}</h2>

        {format === "png" ? (
          <label className="udraw-field">
            <span>Escala</span>
            <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
              {SCALES.map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="udraw-field udraw-field--check">
          <input
            type="checkbox"
            checked={withBackground}
            onChange={(event) => setWithBackground(event.target.checked)}
          />
          <span>Incluir fundo</span>
        </label>

        <label className="udraw-field udraw-field--check">
          <input
            type="checkbox"
            checked={selectionOnly}
            disabled={!hasSelection}
            onChange={(event) => setSelectionOnly(event.target.checked)}
          />
          <span>
            Somente a seleção
            {hasSelection ? "" : " (nada selecionado)"}
          </span>
        </label>

        <div className="udraw-dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="udraw-dialog__primary"
            onClick={() => onConfirm({ format, scale, withBackground, selectionOnly })}
          >
            Exportar
          </button>
        </div>
      </div>
    </div>
  );
}
