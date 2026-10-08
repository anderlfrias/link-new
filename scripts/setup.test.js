// Tests de scripts/setup.js (`node --test scripts/`). Trabajan sobre un directorio temporal con
// copias de los `.env.example` del repo: nunca tocan los archivos de entorno reales.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const webpush = require("web-push");
const { fillEnv, generateVapidKeys, main, randomSecret, readValue } = require("./setup");

const REPO = path.join(__dirname, "..");
const EXAMPLES = [".env.example", "backend/.env.example", "frontend/.env.example"];

/// Directorio temporal con los `.env.example` reales (así un cambio en ellos que rompa el script
/// se nota). `examples` permite dejar alguno afuera.
function makeRoot(examples = EXAMPLES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "link-setup-"));
  for (const example of examples) {
    const target = path.join(root, example);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPO, example), target);
  }
  return root;
}

function run(root, args = []) {
  const out = [];
  const err = [];
  const code = main(args, { root, log: (line) => out.push(line), error: (line) => err.push(line) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8");

const SAMPLE = [
  "# Variables de ejemplo",
  "POSTGRES_PASSWORD=change-me",
  "LOCAL_AUTH_JWT_SECRET=",
  'FILE_URL_SIGNING_SECRET=""',
  "VAPID_PUBLIC_KEY=",
  "VAPID_PRIVATE_KEY=",
  "VAPID_SUBJECT=mailto:admin@example.com",
  "CORS_ORIGIN=http://localhost:3000",
  "",
].join("\n");

test("generateVapidKeys devuelve claves de 87 y 43 caracteres que web-push acepta", () => {
  // Varias veces: una de cada ~256 claves privadas empieza con ceros y es más corta sin relleno.
  for (let i = 0; i < 300; i += 1) {
    const { publicKey, privateKey } = generateVapidKeys();
    assert.equal(publicKey.length, 87);
    assert.equal(privateKey.length, 43);
    // Es el chequeo que hace el backend al arrancar (push.service.ts): con claves inválidas no levanta.
    assert.doesNotThrow(() => webpush.setVapidDetails("mailto:a@example.com", publicKey, privateKey));
  }
});

test("generateVapidKeys rellena con ceros una clave privada de menos de 32 bytes", (t) => {
  const real = crypto.createECDH("prime256v1");
  real.generateKeys();
  t.mock.method(crypto, "createECDH", () => ({
    generateKeys() {},
    getPublicKey: () => real.getPublicKey(),
    getPrivateKey: () => Buffer.alloc(31, 7),
  }));

  const { privateKey } = generateVapidKeys();

  const decoded = Buffer.from(privateKey, "base64url");
  assert.equal(decoded.length, 32);
  assert.equal(decoded[0], 0);
  assert.equal(decoded[1], 7);
});

test("randomSecret tiene el largo pedido y no se repite", () => {
  const first = randomSecret(48);
  assert.ok(first.length >= 32);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(first, randomSecret(48));
});

test("fillEnv completa solo las variables vacías, con y sin comillas, y conserva el resto", () => {
  const { content, filled, warnings } = fillEnv(SAMPLE, { created: true });

  assert.deepEqual(filled, [
    "POSTGRES_PASSWORD",
    "LOCAL_AUTH_JWT_SECRET",
    "FILE_URL_SIGNING_SECRET",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
  ]);
  assert.deepEqual(warnings, []);
  assert.notEqual(readValue(content, "POSTGRES_PASSWORD"), "change-me");
  assert.ok(readValue(content, "LOCAL_AUTH_JWT_SECRET").length >= 32);
  // Conservó las comillas de la variable que las tenía.
  assert.match(content, /^FILE_URL_SIGNING_SECRET="[A-Za-z0-9_-]{64}"$/m);
  // El resto, intacto y en el mismo orden.
  assert.ok(content.startsWith("# Variables de ejemplo\nPOSTGRES_PASSWORD="));
  assert.match(content, /\nCORS_ORIGIN=http:\/\/localhost:3000\n$/);
  assert.equal(readValue(content, "VAPID_SUBJECT"), "mailto:admin@example.com");
});

test("fillEnv no pisa valores existentes y respeta el final de línea CRLF", () => {
  const withValues = SAMPLE.replace("LOCAL_AUTH_JWT_SECRET=", "LOCAL_AUTH_JWT_SECRET=ya-existente-y-largo-de-sobra-0123456789")
    .replace("VAPID_PUBLIC_KEY=", "VAPID_PUBLIC_KEY=pub")
    .replace("VAPID_PRIVATE_KEY=", "VAPID_PRIVATE_KEY=priv")
    .replace(/\n/g, "\r\n");

  const { content, filled } = fillEnv(withValues, { created: false });

  assert.equal(readValue(content, "LOCAL_AUTH_JWT_SECRET"), "ya-existente-y-largo-de-sobra-0123456789");
  assert.equal(readValue(content, "VAPID_PUBLIC_KEY"), "pub");
  assert.equal(readValue(content, "VAPID_PRIVATE_KEY"), "priv");
  assert.deepEqual(filled, ["FILE_URL_SIGNING_SECRET"]);
  assert.ok(content.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(content), "no mezcló finales de línea");
});

test("fillEnv conserva un comentario al final de la línea", () => {
  const { content } = fillEnv('FILE_URL_SIGNING_SECRET="" # opcional\n', { created: false });

  assert.match(content, /^FILE_URL_SIGNING_SECRET="[A-Za-z0-9_-]{64}" # opcional\n$/);
});

test("main en modo Docker crea el .env sin pasos manuales", () => {
  const root = makeRoot();

  const { code, out } = run(root);

  assert.equal(code, 0);
  const env = read(root, ".env");
  assert.notEqual(readValue(env, "POSTGRES_PASSWORD"), "change-me");
  assert.ok(readValue(env, "POSTGRES_PASSWORD").length >= 24);
  assert.ok(readValue(env, "LOCAL_AUTH_JWT_SECRET").length >= 32);
  assert.ok(readValue(env, "FILE_URL_SIGNING_SECRET").length >= 32);
  assert.equal(readValue(env, "VAPID_PUBLIC_KEY").length, 87);
  assert.equal(readValue(env, "VAPID_PRIVATE_KEY").length, 43);
  assert.doesNotThrow(() =>
    webpush.setVapidDetails("mailto:a@example.com", readValue(env, "VAPID_PUBLIC_KEY"), readValue(env, "VAPID_PRIVATE_KEY")),
  );
  assert.match(out, /\.env creado a partir de \.env\.example/);
  assert.match(out, /docker compose up -d --build/);
});

test("main deja el .env creado solo legible por su dueño (en sistemas POSIX)", { skip: process.platform === "win32" }, () => {
  const root = makeRoot();

  run(root);

  assert.equal(fs.statSync(path.join(root, ".env")).mode & 0o777, 0o600);
});

test("main no imprime ningún secreto generado", () => {
  const root = makeRoot();

  const { out, err } = run(root);

  const env = read(root, ".env");
  for (const key of ["POSTGRES_PASSWORD", "LOCAL_AUTH_JWT_SECRET", "FILE_URL_SIGNING_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
    const value = readValue(env, key);
    assert.ok(!out.includes(value) && !err.includes(value), `${key} apareció en la salida`);
    assert.ok(out.includes(key), `${key} no figura entre las completadas`);
  }
});

test("main sobre un .env ya completo lo deja idéntico, byte por byte, sin mostrar sus valores", () => {
  const root = makeRoot();
  run(root);
  const before = read(root, ".env");

  const { code, out } = run(root);

  assert.equal(code, 0);
  assert.equal(read(root, ".env"), before);
  assert.match(out, /\.env ya existía/);
  assert.match(out, /sin variables por completar/);
  for (const key of ["LOCAL_AUTH_JWT_SECRET", "VAPID_PRIVATE_KEY"]) {
    assert.ok(!out.includes(readValue(before, key)));
  }
});

test("main no cambia POSTGRES_PASSWORD=change-me de un .env existente y avisa", () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, ".env"), SAMPLE);

  const { out } = run(root);

  const env = read(root, ".env");
  assert.equal(readValue(env, "POSTGRES_PASSWORD"), "change-me");
  assert.match(out, /POSTGRES_PASSWORD sigue en el valor de ejemplo/);
  // Lo demás que estaba vacío sí se completó.
  assert.ok(readValue(env, "LOCAL_AUTH_JWT_SECRET").length >= 32);
});

test("con las tres EXTERNAL_AUTH_* definidas no genera LOCAL_AUTH_JWT_SECRET", () => {
  const withProvider = SAMPLE + "EXTERNAL_AUTH_API_URL=https://external-auth.example.com\nAPP_CODE_EXTERNAL_AUTH=link\nEXTERNAL_AUTH_JWT_SECRET=secreto\n";

  const { content, filled } = fillEnv(withProvider, { created: false });

  assert.equal(readValue(content, "LOCAL_AUTH_JWT_SECRET"), "");
  assert.ok(!filled.includes("LOCAL_AUTH_JWT_SECRET"));
});

test("con solo una clave VAPID cargada no genera ninguna de las dos y avisa", () => {
  const onlyPublic = SAMPLE.replace("VAPID_PUBLIC_KEY=", "VAPID_PUBLIC_KEY=solo-la-publica");

  const { content, filled, warnings } = fillEnv(onlyPublic, { created: false });

  assert.equal(readValue(content, "VAPID_PUBLIC_KEY"), "solo-la-publica");
  assert.equal(readValue(content, "VAPID_PRIVATE_KEY"), "");
  assert.ok(!filled.includes("VAPID_PUBLIC_KEY") && !filled.includes("VAPID_PRIVATE_KEY"));
  assert.match(warnings.join("\n"), /Solo una de VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY/);
});

test("--vapid-subject reemplaza el de ejemplo pero no uno que ya se eligió", () => {
  const root = makeRoot();
  run(root, ["--vapid-subject", "mailto:equipo@example.org"]);
  assert.equal(readValue(read(root, ".env"), "VAPID_SUBJECT"), "mailto:equipo@example.org");

  run(root, ["--vapid-subject", "mailto:otro@example.org"]);
  assert.equal(readValue(read(root, ".env"), "VAPID_SUBJECT"), "mailto:equipo@example.org");
});

test("--vapid-subject inválido es un error de uso y no escribe nada", () => {
  const root = makeRoot();

  const { code, err } = run(root, ["--vapid-subject", "admin@example.com"]);

  assert.equal(code, 2);
  assert.match(err, /mailto:/);
  assert.ok(!fs.existsSync(path.join(root, ".env")));
});

test("una opción desconocida es un error de uso", () => {
  const root = makeRoot();

  const { code, err } = run(root, ["--forzar"]);

  assert.equal(code, 2);
  assert.match(err, /Opción desconocida: --forzar/);
});

test("--dev crea backend/.env y frontend/.env.local, y deja la raíz sin tocar", () => {
  const root = makeRoot();

  const { code, out } = run(root, ["--dev"]);

  assert.equal(code, 0);
  const backendEnv = read(root, "backend/.env");
  assert.ok(readValue(backendEnv, "LOCAL_AUTH_JWT_SECRET").length >= 32);
  assert.equal(readValue(backendEnv, "VAPID_PUBLIC_KEY").length, 87);
  // El DATABASE_URL de ejemplo apunta al contenedor de la guía: no se toca.
  assert.match(backendEnv, /^DATABASE_URL="postgresql:\/\/link:link@localhost:5432\/link\?schema=public"$/m);
  assert.equal(read(root, "frontend/.env.local"), read(root, "frontend/.env.example"));
  assert.ok(!fs.existsSync(path.join(root, ".env")));
  assert.match(out, /npm run dev/);
});

test("sin el .env.example del modo pedido sale con código 1 y un mensaje claro", () => {
  const root = makeRoot([".env.example"]);

  const { code, err } = run(root, ["--dev"]);

  assert.equal(code, 1);
  assert.match(err, /Falta backend\/\.env\.example y frontend\/\.env\.example/);
  assert.ok(!fs.existsSync(path.join(root, "backend/.env")));
});

test("--help muestra el uso y sale con código 0", () => {
  const { code, out } = run(makeRoot(), ["--help"]);

  assert.equal(code, 0);
  assert.match(out, /Uso: npm run setup/);
});
