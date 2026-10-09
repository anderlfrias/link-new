// Comprobaciones de coherencia del repositorio que no dependen de ninguna dependencia instalada:
// corren en la CI (`npm run test:scripts`) y en el workflow de publicación de imágenes, antes de
// construir nada. Ver VERSIONING.md.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..");
const readText = (file) => fs.readFileSync(path.join(REPO, file), "utf8");
const readJson = (file) => JSON.parse(readText(file));

const rootPkg = readJson("package.json");
const lock = readJson("package-lock.json");

test("la versión es la misma en los package.json, el lockfile y la interfaz", () => {
  const version = rootPkg.version;
  const appVersion = readText("frontend/src/constants/app-version.constant.ts").match(/APP_VERSION\s*=\s*"([^"]+)"/);

  assert.ok(appVersion, "no se encontró APP_VERSION en frontend/src/constants/app-version.constant.ts");
  assert.equal(readJson("backend/package.json").version, version, "backend/package.json");
  assert.equal(readJson("frontend/package.json").version, version, "frontend/package.json");
  assert.equal(appVersion[1], version, "APP_VERSION");
  assert.equal(lock.packages[""].version, version, "package-lock.json (raíz)");
  assert.equal(lock.packages.backend.version, version, "package-lock.json (backend)");
  assert.equal(lock.packages.frontend.version, version, "package-lock.json (frontend)");
});

test("la última versión publicada del CHANGELOG es la versión del proyecto", () => {
  // Lo primero que sigue a `## [Unreleased]` es la versión vigente: las notas de una versión
  // futura van bajo `[Unreleased]` hasta que se corta el release.
  const changelog = readText("CHANGELOG.md");
  assert.match(changelog, /^## \[Unreleased\]/m, "falta la sección [Unreleased]");

  const released = changelog.match(/^## \[(\d+\.\d+\.\d+[^\]]*)\] - (\d{4}-\d{2}-\d{2})$/m);
  assert.ok(released, "no hay ninguna versión publicada con fecha en el CHANGELOG");
  assert.equal(released[1], rootPkg.version);
});

test("cada override con versión exacta se cumple en el lockfile", () => {
  // `overrides` en package.json no alcanza por sí solo: si el lockfile no se regenera, `npm ci`
  // sigue instalando la versión anterior y la alerta de seguridad que el override arreglaba
  // queda abierta sin que nadie lo note.
  const exact = Object.entries(rootPkg.overrides ?? {}).filter(
    ([, spec]) => typeof spec === "string" && /^\d+\.\d+\.\d+$/.test(spec),
  );
  assert.ok(exact.length > 0, "se esperaba al menos un override con versión exacta");

  for (const [name, expected] of exact) {
    const installed = Object.entries(lock.packages)
      .filter(([key]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`))
      .map(([key, entry]) => ({ key, version: entry.version }));

    for (const { key, version } of installed) {
      assert.equal(version, expected, `${key} debería estar en ${expected} por el override de ${name}`);
    }
  }
});
