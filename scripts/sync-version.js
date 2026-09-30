const fs = require("fs");
const path = require("path");

const rootPkgPath = path.join(__dirname, "..", "package.json");
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
const version = rootPkg.version;

console.log(`Sincronizando versión ${version} en todos los paquetes...`);

const targets = [
  path.join(__dirname, "..", "backend", "package.json"),
  path.join(__dirname, "..", "frontend", "package.json"),
];

targets.forEach((targetPath) => {
  if (fs.existsSync(targetPath)) {
    const pkg = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    pkg.version = version;
    fs.writeFileSync(targetPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    console.log(`✓ Actualizado: ${path.relative(path.join(__dirname, ".."), targetPath)} -> ${version}`);
  }
});

const appVersionTsPath = path.join(
  __dirname,
  "..",
  "frontend",
  "src",
  "constants",
  "app-version.constant.ts"
);
if (fs.existsSync(appVersionTsPath)) {
  fs.writeFileSync(appVersionTsPath, `export const APP_VERSION = "${version}";\n`, "utf8");
  console.log(`✓ Actualizado: frontend/src/constants/app-version.constant.ts -> ${version}`);
}

console.log("Sincronización completada exitosamente.");
