# uDraw

Aplicação **desktop offline** de desenho livre — o Excalidraw rodando localmente,
com arquivos no seu disco e um conversor de diagramas Mermaid embutido.

- **Desenho completo.** Usa o pacote oficial `@excalidraw/excalidraw` (MIT), então
  todas as ferramentas estão disponíveis desde o primeiro dia: formas, texto,
  setas com vínculo, mão livre, imagens, frames, bibliotecas, undo/redo.
- **Offline de verdade.** As fontes são servidas do próprio app; nenhuma
  requisição sai para a rede. A CSP do Tauri não permite nenhuma origem externa.
- **Arquivos locais.** `.udraw` é a extensão nativa e o conteúdo é JSON idêntico ao
  do Excalidraw, então o mesmo arquivo abre em `excalidraw.com` e vice-versa.
- **Diagramas Mermaid.** Escreva o código, veja o preview e insira — o diagrama
  vira elementos nativos do canvas, editáveis com qualquer ferramenta. A conversão
  é única: o código não fica guardado.

## Requisitos

Node 20+, Rust 1.77+ e as dependências de build do Tauri para a sua plataforma
(no Windows, o WebView2 já vem com o sistema).

## Desenvolvimento

```bash
npm install          # também copia as fontes do Excalidraw para public/fonts
npm run tauri dev    # sobe o app desktop
```

| Comando | O que faz |
|---|---|
| `npm run tauri dev` | Executa o app desktop com hot reload |
| `npm run tauri build` | Gera o instalador para a plataforma atual |
| `npm test` | Testes unitários da lógica pura (vitest) |
| `npm run smoke` | Testes de integração num Chromium real (exige `npm run dev` rodando) |
| `npm run build` | Typecheck + bundle do frontend |
| `npm run release` | Compila e publica os instaladores como release no GitHub |

## Estrutura

```
src-tauri/src/
  lib.rs          menu nativo, instância única, abertura por argv
  document.rs     leitura e gravação atômica (temp + rename)
  recents.rs      lista de arquivos recentes
  recovery.rs     rascunho de autosave para recuperação
src/
  canvas/         wrapper do <Excalidraw> e menu interno
  document/       formato, abrir/salvar, autosave, exportação
  mermaid/        conversão e inserção de diagramas
  shell/          diálogos modais
```

A camada Rust é fina de propósito: só faz o que o JS não consegue (IO confiável,
menu nativo, argv, associação de extensão). Toda a lógica de aplicação é React.

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+N` | Novo desenho |
| `Ctrl+O` | Abrir |
| `Ctrl+S` | Salvar |
| `Ctrl+Shift+S` | Salvar como |
| `Ctrl+Shift+M` | Inserir diagrama Mermaid |
| `Ctrl+Shift+E` | Exportar PNG |
| `Ctrl+'` | Mostrar/ocultar a grade (ou o botão ao lado do zoom) |

Não há menu **Editar** nativo de propósito: acelerador nativo em `Ctrl+C`/`Ctrl+V`/
`Ctrl+Z` engoliria as teclas que o Excalidraw precisa para copiar e desfazer no canvas.

## Grade

O botão ao lado do zoom, no canto inferior esquerdo, liga e desliga a grade. Ele
entra na própria linha do rodapé do Excalidraw via portal, então acompanha o
espaçamento, o tema claro/escuro e o layout responsivo do editor sem coordenadas
fixas. O estado é compartilhado com o atalho nativo `Ctrl+'`: usar um reflete no
outro. Como `gridModeEnabled` é gravado no arquivo, alternar a grade marca o
documento como modificado.

## Publicando uma versão

`scripts/release.mjs` compila e sobe os instaladores para um release do GitHub:

```bash
npm run release -- --dry-run     # mostra o que faria, sem publicar
npm run release                  # compila e publica v<versao>
npm run release -- --skip-build  # reaproveita os instaladores ja compilados
npm run release -- --draft       # publica como rascunho
```

A versão vem de `src-tauri/tauri.conf.json` (a que realmente vai para o
instalador) e o script aborta se ela divergir da do `package.json`. Antes de
publicar ele confere que o `gh` está autenticado, que há um remote `origin` e que
a árvore de trabalho está limpa, e recusa instaladores que não sejam da versão
atual — assim um `.exe` sobrando de um build anterior nunca vai junto. Se o
release já existir, os arquivos são reenviados com `--clobber` em vez de falhar.

## Formato de arquivo

`.udraw` e `.excalidraw` são o mesmo JSON. A serialização usa o `serializeAsJSON`
do próprio Excalidraw, que já descarta estado efêmero (seleção, colaboradores,
cursor) e embute só as imagens realmente referenciadas.

```jsonc
{
  "type": "excalidraw",
  "version": 2,
  "source": "udraw",
  "elements": [ /* ... */ ],
  "appState": { "viewBackgroundColor": "#ffffff" },
  "files": { /* imagens em dataURL */ }
}
```

A gravação é atômica (arquivo temporário + rename), então uma queda no meio da
escrita nunca trunca um desenho existente.

## Diagramas Mermaid

`Ctrl+Shift+M` abre o editor: código à esquerda, preview à direita renderizado
com o mesmo `exportToSvg` do canvas — o que você vê é exatamente o que será
inserido. Ao confirmar, os elementos entram agrupados, centralizados no viewport
e já selecionados, como **uma única** entrada de undo.

### Limitação herdada do conversor

Só existem conversores nativos para cinco tipos de diagrama:

| Tipo | Resultado |
|---|---|
| `flowchart` / `graph` | formas nativas editáveis |
| `sequenceDiagram` | formas nativas editáveis |
| `classDiagram` | formas nativas editáveis |
| `erDiagram` | formas nativas editáveis |
| `stateDiagram` | formas nativas editáveis |
| qualquer outro (`pie`, `gantt`, `mindmap`, `gitGraph`, `journey`, `timeline`...) | **uma única imagem**, não editável forma a forma |

O painel avisa antes de inserir quando o diagrama vai cair nesse caso, para que a
limitação não seja uma surpresa depois.

## Testes

Os testes unitários cobrem a lógica que não depende do runtime do Excalidraw
(caminhos de arquivo, validação de documento, detecção de tipo de diagrama,
posicionamento e agrupamento). O Excalidraw e o Mermaid precisam de um navegador
de verdade — usam métricas de canvas e `getBBox`, que o jsdom não implementa —
então o resto é coberto por `npm run smoke`, que dirige um Chromium real contra o
dev server e importa os módulos do próprio app (`/src/...`) via Vite.

O smoke test verifica, entre outras coisas: que o canvas monta, que nenhuma
requisição externa é feita, que um flowchart vira formas com setas vinculadas,
que um `pie` cai para imagem e é sinalizado, que o round-trip de `.udraw`
preserva ids e agrupamento, e que a exportação grava um PNG válido.
