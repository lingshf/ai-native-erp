import { readdirSync, readFileSync, existsSync, lstatSync } from "node:fs";
import { resolve, relative, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { parse } from "@babel/parser";

const projects = {
  domain: "packages/core/src/domain/",
  application: "packages/core/src/application/",
  contracts: "packages/core/src/contracts/",
  infra: "packages/infra/src/",
  web: "packages/web/src/",
};
const edges = {
  core: [],
  domain: ["domain"],
  application: ["application", "domain"],
  contracts: ["contracts"],
  infra: ["infra", "application", "domain", "contracts"],
  web: ["web", "contracts"],
};
const external = {
  core: [],
  domain: [],
  application: [],
  contracts: ["zod"],
  infra: ["kysely", "better-sqlite3", "fastify", "@fastify/static", "@github/copilot-sdk"],
  web: [
    "react",
    "react-dom",
    "react-router-dom",
    "@tanstack/react-query",
    "@tanstack/react-virtual",
  ],
};
const browser = new Set([
  "document",
  "window",
  "navigator",
  "localStorage",
  "sessionStorage",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "HTMLElement",
  "Request",
  "Response",
  "process",
]);
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const projectOf = (file) =>
  Object.entries(projects).find(([, prefix]) => file.startsWith(prefix))?.[0] ??
  (file.startsWith("packages/core/src/") ? "core" : undefined);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export function checkImportBoundaries(file, text) {
  const normalized = file.replaceAll("\\", "/"),
    owner = projectOf(normalized);
  if (!owner) return [];
  const ast = parse(text, {
    sourceType: "module",
    sourceFilename: file,
    createImportExpressions: true,
    plugins: /\.[jt]sx$/.test(file)
      ? ["typescript", "decorators-legacy", "jsx"]
      : ["typescript", "decorators-legacy"],
  });
  const violations = [];
  const report = (node, reason) =>
    violations.push({ file: normalized, line: node.loc.start.line, reason });
  const dependency = (node, specifier) => {
    if (!specifier || specifier.type !== "StringLiteral") {
      report(node, "Computed module dependencies are not allowed in checked source.");
      return;
    }
    const name = specifier.value;
    if (
      owner === "infra" &&
      (name === "better-sqlite3" || name.startsWith("better-sqlite3/")) &&
      !normalized.startsWith("packages/infra/src/storage/") &&
      normalized !== "packages/infra/src/workers/entry.ts"
    )
      report(node, "Native SQLite imports are restricted to storage and the worker entry.");
    const destination = name.startsWith(".")
      ? projectOf(posix.normalize(posix.join(posix.dirname(normalized), name)))
      : (/^@erp\/core\/(domain|application|contracts)$/.exec(name)?.[1] ??
        (/^@erp\/infra(?:\/|$)/.test(name)
          ? "infra"
          : /^@erp\/web(?:\/|$)/.test(name)
            ? "web"
            : undefined));
    if (name.startsWith(".") || name.startsWith("@erp/")) {
      if (!destination || !edges[owner].includes(destination))
        report(node, `${owner} cannot import ${name}.`);
    } else if (
      !(owner === "infra" && builtins.has(name.replace(/^node:/, ""))) &&
      !external[owner].some((allowed) => name === allowed || name.startsWith(`${allowed}/`))
    ) {
      report(node, `${owner} cannot import external dependency: ${name}.`);
    }
  };
  const visit = (node) => {
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)
    ) {
      if (node.source) dependency(node, node.source);
    } else if (
      node.type === "TSImportEqualsDeclaration" &&
      node.moduleReference.type === "TSExternalModuleReference"
    ) {
      dependency(node, node.moduleReference.expression);
    } else if (node.type === "ImportExpression") {
      dependency(node, node.source);
    } else if (node.type === "TSImportType") {
      dependency(node, node.argument);
    } else if (
      node.type === "CallExpression" &&
      (node.callee.type === "Import" ||
        (node.callee.type === "Identifier" && node.callee.name === "require"))
    ) {
      dependency(node, node.arguments[0]);
    }
    if (owner === "domain" && node.type === "Identifier" && browser.has(node.name)) {
      report(node, `Pure domain cannot access ambient runtime ${node.name}.`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === "string") visit(child);
      } else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
    }
  };
  visit(ast);
  return violations;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symbolic source entry is not allowed: ${entry.name}`);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)
        ? [file]
        : [];
  });
}

export function checkRepositoryBoundaries(root = repositoryRoot) {
  const files = [];
  for (const prefix of Object.values(projects)) {
    const directory = join(root, prefix);
    if (!existsSync(directory)) throw new Error(`Missing required source directory: ${prefix}`);
    const entry = lstatSync(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error(`Invalid source directory: ${prefix}`);
    const found = sourceFiles(directory);
    if (!found.length) throw new Error(`Empty required source directory: ${prefix}`);
  }
  for (const prefix of ["packages/core/src", "packages/infra/src", "packages/web/src"]) {
    files.push(...sourceFiles(join(root, prefix)));
  }
  if (!files.length) throw new Error("Empty repository source scan cannot pass import boundaries.");
  return {
    files: files.map((file) => relative(root, file).replaceAll("\\", "/")),
    violations: files.flatMap((file) =>
      checkImportBoundaries(relative(root, file), readFileSync(file, "utf8")),
    ),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, violations } = checkRepositoryBoundaries();
  if (violations.length) {
    for (const violation of violations)
      console.error(`${violation.file}:${violation.line}: ${violation.reason}`);
    process.exitCode = 1;
  } else console.log(`Import boundaries passed for ${files.length} source files.`);
}
