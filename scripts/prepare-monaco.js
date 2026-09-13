import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function findMonacoDir(startDir) {
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "monaco-editor" && entry.isDirectory()) {
      return path.join(startDir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const found = findMonacoDir(path.join(startDir, entry.name));
        if (found) return found;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

const nodeModulesDir = path.resolve(rootDir, "node_modules");
const monacoRoot = findMonacoDir(nodeModulesDir);

if (!monacoRoot) {
  console.error("Could not find monaco-editor package in node_modules");
  process.exit(1);
}

const srcDir = path.join(monacoRoot, "min/vs");
const destDir = path.resolve(rootDir, "public/monaco/min/vs");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(srcDir, destDir);

const loaderPath = path.join(destDir, "loader.js");
let loaderContent = fs.readFileSync(loaderPath, "utf8");
loaderContent = loaderContent.replace(/\/\/# sourceMappingURL=.*\n?/, "");
fs.writeFileSync(loaderPath, loaderContent);

console.log("Monaco Editor copied to public/monaco/ and patched");
