import { MainMenu } from "@excalidraw/excalidraw";

import type { Recent } from "../document/backend";

export type MenuCommand =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "export-png"
  | "export-svg"
  | "copy-png"
  | "insert-mermaid"
  | "recent-clear";

type Props = {
  recents: Recent[];
  onCommand: (command: MenuCommand) => void;
  onOpenRecent: (path: string) => void;
};

/**
 * Mirrors the native menubar inside the canvas, where Excalidraw users expect
 * to find it. Both surfaces dispatch the same commands.
 */
export function MainMenuBar({ recents, onCommand, onOpenRecent }: Props) {
  return (
    <MainMenu>
      <MainMenu.Item shortcut="Ctrl+N" onSelect={() => onCommand("new")}>
        Novo
      </MainMenu.Item>
      <MainMenu.Item shortcut="Ctrl+O" onSelect={() => onCommand("open")}>
        Abrir...
      </MainMenu.Item>
      <MainMenu.Item shortcut="Ctrl+S" onSelect={() => onCommand("save")}>
        Salvar
      </MainMenu.Item>
      <MainMenu.Item shortcut="Ctrl+Shift+S" onSelect={() => onCommand("save-as")}>
        Salvar como...
      </MainMenu.Item>

      <MainMenu.Separator />

      <MainMenu.Item shortcut="Ctrl+Shift+M" onSelect={() => onCommand("insert-mermaid")}>
        Diagrama Mermaid...
      </MainMenu.Item>

      <MainMenu.Separator />

      <MainMenu.Item shortcut="Ctrl+Shift+E" onSelect={() => onCommand("export-png")}>
        Exportar PNG...
      </MainMenu.Item>
      <MainMenu.Item onSelect={() => onCommand("export-svg")}>Exportar SVG...</MainMenu.Item>
      <MainMenu.Item onSelect={() => onCommand("copy-png")}>
        Copiar imagem
      </MainMenu.Item>

      {recents.length ? (
        <>
          <MainMenu.Separator />
          <MainMenu.Group title="Abrir recente">
            {recents.slice(0, 6).map((recent) => (
              <MainMenu.Item
                key={recent.path}
                onSelect={() => onOpenRecent(recent.path)}
                title={recent.path}
              >
                {recent.name}
              </MainMenu.Item>
            ))}
            <MainMenu.Item onSelect={() => onCommand("recent-clear")}>
              Limpar recentes
            </MainMenu.Item>
          </MainMenu.Group>
        </>
      ) : null}

      <MainMenu.Separator />
      {/* We don't track a separate "system theme" preference of our own, so this
          keeps the previous light/dark-only toggle behavior. */}
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme={false} />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
}
