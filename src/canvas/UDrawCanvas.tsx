import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { ReactNode } from "react";

type Props = {
  /** Called once with the imperative handle used by the document and mermaid layers. */
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
  onChange?: ExcalidrawProps["onChange"];
  initialData?: ExcalidrawProps["initialData"];
  /** Excalidraw UI slots: <MainMenu>, <WelcomeScreen>, <Sidebar>, ... */
  children?: ReactNode;
};

export function UDrawCanvas({ onApiReady, onChange, initialData, children }: Props) {
  return (
    <div className="udraw-canvas">
      <Excalidraw
        excalidrawAPI={onApiReady}
        onChange={onChange}
        initialData={initialData}
        // The desktop app owns file IO, so Excalidraw's own export/save entries are hidden.
        UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false } }}
      >
        {children}
      </Excalidraw>
    </div>
  );
}
