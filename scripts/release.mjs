/**
 * Builds the desktop app and publishes the installers as a GitHub release.
 *
 *   node scripts/release.mjs                 # build + publish v<version>
 *   node scripts/release.mjs --dry-run       # show what would happen, change nothing
 *   node scripts/release.mjs --skip-build    # reuse the artifacts already on disk
 *   node scripts/release.mjs --tag v0.2.0    # override the tag
 *   node scripts/release.mjs --draft         # publish as a draft
 *   node scripts/release.mjs --notes-file NOTES.md
 *
 * The version comes from src-tauri/tauri.conf.json, which is what actually ends
 * up in the installer; package.json is checked against it so the two cannot
 * drift apart silently.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_DIR = join(ROOT, "src-tauri/target/release/bundle");

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const options = {
  dryRun: has("--dry-run"),
  skipBuild: has("--skip-build"),
  draft: has("--draft"),
  prerelease: has("--prerelease"),
  allowDirty: has("--allow-dirty"),
  tag: valueOf("--tag"),
  notes: valueOf("--notes"),
  notesFile: valueOf("--notes-file"),
};

const log = (msg) => console.log(msg);
const step = (msg) => console.log(`\n› ${msg}`);

function fail(message, hint) {
  console.error(`\nErro: ${message}`);
  if (hint) console.error(`       ${hint}`);
  process.exit(1);
}

/** Runs a command, streaming its output. Returns stdout when captured. */
function run(command, args, { capture = false, cwd = ROOT, allowFail = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    if (allowFail) return null;
    fail(`não foi possível executar "${command}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (allowFail) return null;
    if (capture && result.stderr) console.error(result.stderr);
    fail(`"${command} ${args.join(" ")}" terminou com código ${result.status}`);
  }
  return capture ? result.stdout.trim() : "";
}

// ---------------------------------------------------------------- preconditions

step("Verificando pré-requisitos");

if (!run("gh", ["--version"], { capture: true, allowFail: true })) {
  fail("o GitHub CLI (gh) não está instalado ou não está no PATH.", "https://cli.github.com");
}

if (!run("gh", ["auth", "status"], { capture: true, allowFail: true })) {
  fail("o gh não está autenticado.", "Rode: gh auth login");
}

if (!run("git", ["rev-parse", "--is-inside-work-tree"], { capture: true, allowFail: true })) {
  fail("este diretório não é um repositório git.", "Rode: git init");
}

const remote = run("git", ["remote", "get-url", "origin"], { capture: true, allowFail: true });
if (!remote) {
  fail(
    "não há um remote 'origin' configurado.",
    "Rode: gh repo create <nome> --public --source=. --push",
  );
}
log(`  remote: ${remote}`);

const dirty = run("git", ["status", "--porcelain"], { capture: true });
if (dirty && !options.allowDirty) {
  fail(
    "há alterações não commitadas na árvore de trabalho.",
    "Commite antes de publicar, ou use --allow-dirty se for intencional.",
  );
}

// ---------------------------------------------------------------------- version

const tauriConf = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const version = tauriConf.version;

if (!version) {
  fail("src-tauri/tauri.conf.json não define uma versão.");
}
if (pkg.version !== version) {
  fail(
    `as versões divergem: package.json diz ${pkg.version}, tauri.conf.json diz ${version}.`,
    "Deixe as duas iguais antes de publicar.",
  );
}

const tag = options.tag ?? `v${version}`;
log(`  versão: ${version}  →  tag ${tag}`);

const tagExists = !!run("git", ["tag", "--list", tag], { capture: true, allowFail: true });
const releaseExists = !!run("gh", ["release", "view", tag, "--json", "tagName"], {
  capture: true,
  allowFail: true,
});
if (releaseExists) {
  log(`  já existe um release ${tag} — os arquivos serão enviados para ele`);
}

// ------------------------------------------------------------------------ build

if (options.skipBuild) {
  step("Pulando o build (--skip-build)");
} else if (options.dryRun) {
  step("Pulando o build (--dry-run)");
} else {
  step("Compilando o app (npm run tauri build)");
  run("npm", ["run", "tauri", "build"]);
}

// -------------------------------------------------------------------- artifacts

step("Localizando os instaladores");

/** Installers Tauri produces, in the order they should appear on the release. */
const ARTIFACT_PATTERNS = [
  { dir: "nsis", match: /\.exe$/i, label: "instalador Windows (NSIS)" },
  { dir: "msi", match: /\.msi$/i, label: "instalador Windows (MSI)" },
  { dir: "dmg", match: /\.dmg$/i, label: "imagem macOS" },
  { dir: "appimage", match: /\.AppImage$/i, label: "AppImage Linux" },
  { dir: "deb", match: /\.deb$/i, label: "pacote Debian" },
];

const artifacts = [];
for (const pattern of ARTIFACT_PATTERNS) {
  const dir = join(BUNDLE_DIR, pattern.dir);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!pattern.match.test(name)) continue;
    const path = join(dir, name);
    artifacts.push({ path, name, label: pattern.label, size: statSync(path).size });
  }
}

if (!artifacts.length) {
  fail(
    `nenhum instalador encontrado em ${BUNDLE_DIR}.`,
    options.skipBuild
      ? "Rode sem --skip-build para compilar primeiro."
      : "O build terminou sem gerar bundles?",
  );
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
for (const artifact of artifacts) {
  log(`  ${artifact.name}  (${artifact.label}, ${mb(artifact.size)})`);
}

// Guard against shipping installers left over from an older version.
const stale = artifacts.filter((a) => !a.name.includes(version));
if (stale.length) {
  fail(
    `estes arquivos não são da versão ${version}: ${stale.map((a) => a.name).join(", ")}.`,
    "Provavelmente sobraram de um build anterior. Apague src-tauri/target/release/bundle e recompile.",
  );
}

// ------------------------------------------------------------------------ notes

let notes = options.notes;
if (options.notesFile) {
  const notesPath = resolve(ROOT, options.notesFile);
  if (!existsSync(notesPath)) fail(`arquivo de notas não encontrado: ${notesPath}`);
  notes = readFileSync(notesPath, "utf8");
}
if (!notes) {
  notes = [
    `## uDraw ${version}`,
    "",
    "Baixe o instalador para Windows abaixo:",
    "",
    ...artifacts.map((a) => `- \`${a.name}\` — ${a.label}`),
    "",
    "O app é totalmente offline: nenhuma requisição sai para a rede.",
  ].join("\n");
}

// ---------------------------------------------------------------------- publish

const releaseArgs = releaseExists
  ? ["release", "upload", tag, ...artifacts.map((a) => a.path), "--clobber"]
  : [
      "release",
      "create",
      tag,
      ...artifacts.map((a) => a.path),
      "--title",
      `uDraw ${version}`,
      "--notes",
      notes,
      ...(options.draft ? ["--draft"] : []),
      ...(options.prerelease ? ["--prerelease"] : []),
      ...(tagExists ? [] : ["--target", run("git", ["rev-parse", "HEAD"], { capture: true })]),
    ];

if (options.dryRun) {
  step("--dry-run: nada será publicado");
  log(`  gh ${releaseArgs.map((a) => (a.includes("\n") ? "<notas>" : a)).join(" ")}`);
  log("\nPré-requisitos OK. Rode sem --dry-run para publicar de verdade.");
  process.exit(0);
}

step(`${releaseExists ? "Enviando arquivos para" : "Criando"} o release ${tag}`);
run("gh", releaseArgs);

const url = run("gh", ["release", "view", tag, "--json", "url", "--jq", ".url"], {
  capture: true,
  allowFail: true,
});
log(`\nPublicado: ${url ?? tag}`);
