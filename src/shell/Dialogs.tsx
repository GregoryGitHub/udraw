import { useCallback, useState } from "react";

export type UnsavedChoice = "save" | "discard" | "cancel";

type Request =
  | { kind: "unsaved"; name: string; resolve: (choice: UnsavedChoice) => void }
  | { kind: "error"; title: string; message: string; resolve: () => void }
  | {
      kind: "recover";
      savedAt: number;
      name: string;
      resolve: (recover: boolean) => void;
    };

/**
 * Promise-based modals. Tauri's native dialogs only offer two buttons, which is
 * one short of the save/discard/cancel choice an editor needs when closing.
 */
export function useDialogs() {
  const [request, setRequest] = useState<Request | null>(null);

  const confirmUnsaved = useCallback(
    (name: string) =>
      new Promise<UnsavedChoice>((resolve) =>
        setRequest({ kind: "unsaved", name, resolve }),
      ),
    [],
  );

  const showError = useCallback(
    (title: string, message: string) =>
      new Promise<void>((resolve) =>
        setRequest({ kind: "error", title, message, resolve }),
      ),
    [],
  );

  const confirmRecover = useCallback(
    (name: string, savedAt: number) =>
      new Promise<boolean>((resolve) =>
        setRequest({ kind: "recover", name, savedAt, resolve }),
      ),
    [],
  );

  const finish = <T,>(resolve: (value: T) => void, value: T) => {
    setRequest(null);
    resolve(value);
  };

  let body: React.ReactNode = null;
  if (request?.kind === "unsaved") {
    body = (
      <>
        <h2>Alterações não salvas</h2>
        <p>
          O desenho <strong>{request.name}</strong> tem alterações que ainda não foram
          salvas.
        </p>
        <div className="udraw-dialog__actions">
          <button type="button" onClick={() => finish(request.resolve, "cancel")}>
            Cancelar
          </button>
          <button type="button" onClick={() => finish(request.resolve, "discard")}>
            Descartar
          </button>
          <button
            type="button"
            className="udraw-dialog__primary"
            onClick={() => finish(request.resolve, "save")}
          >
            Salvar
          </button>
        </div>
      </>
    );
  } else if (request?.kind === "error") {
    body = (
      <>
        <h2>{request.title}</h2>
        <p>{request.message}</p>
        <div className="udraw-dialog__actions">
          <button
            type="button"
            className="udraw-dialog__primary"
            onClick={() => finish(request.resolve, undefined)}
          >
            Fechar
          </button>
        </div>
      </>
    );
  } else if (request?.kind === "recover") {
    body = (
      <>
        <h2>Recuperar desenho</h2>
        <p>
          O uDraw foi encerrado com alterações não salvas em{" "}
          <strong>{request.name}</strong> ({new Date(request.savedAt).toLocaleString("pt-BR")}
          ). Deseja recuperá-las?
        </p>
        <div className="udraw-dialog__actions">
          <button type="button" onClick={() => finish(request.resolve, false)}>
            Descartar
          </button>
          <button
            type="button"
            className="udraw-dialog__primary"
            onClick={() => finish(request.resolve, true)}
          >
            Recuperar
          </button>
        </div>
      </>
    );
  }

  const dialogs = body ? (
    <div className="udraw-dialog__backdrop" role="dialog" aria-modal="true">
      <div className="udraw-dialog">{body}</div>
    </div>
  ) : null;

  return { dialogs, confirmUnsaved, showError, confirmRecover };
}
