// TDZ rule (S12 SLOT-02, S11 retrospective action 2). Within one function or block scope, in text order,
// a `let` / `const` / `class` binding is hit when, before its declaration, the scope executes
//   (a) a direct reference to the binding, or
//   (b) a reference to a local function (hoisted declaration or function value) that references the
//       binding directly or through other local functions.
// Any reference to a local function counts as a call, so passing it as an argument is treated as
// calling it there (conservative, as the task asks).
import { analyzeScopes, functionPath, TDZ_KINDS } from "./scopes.mjs";

/**
 * Returns one finding per (binding, reference site):
 * { key, binding, line, declarationLine, via } where `via` lists the local functions from the called
 * one to the one that touches the binding (empty for a direct reference).
 */
export function findTdzFindings(ast) {
  const { references, functionOf } = analyzeScopes(ast);
  const reachableFrom = createReachability(references, functionOf);
  const findings = new Map();
  for (const reference of references) {
    if (!TDZ_KINDS.has(reference.binding.kind) && !reference.binding.functionNode) continue;
    for (const finding of findingsAt(reference, reachableFrom, functionOf)) {
      findings.set(`${finding.key}@${finding.line}`, finding);
    }
  }
  return [...findings.values()].sort((left, right) => left.line - right.line);
}

/** Baseline key: enclosing function path plus binding name, never the file or line. */
export function tdzKey(binding) {
  return [...functionPath(binding.scope.fn), binding.name].join(" > ");
}

// Walks outwards from the reference through every scope that runs in the same function, checking
// the TDZ bindings declared there after the reference.
function* findingsAt(reference, reachableFrom, functionOf) {
  for (let scope = reference.scope; scope; scope = scope.parent) {
    if (scope.fn.execOwner !== reference.execOwner) return;
    for (const binding of scope.bindings.values()) {
      if (!TDZ_KINDS.has(binding.kind) || binding.declarationStart <= reference.start) continue;
      const via = pathToBinding(reference, binding, reachableFrom, functionOf);
      if (via) yield finding(binding, reference, via);
    }
  }
}

function pathToBinding(reference, binding, reachableFrom, functionOf) {
  if (reference.binding === binding) return [];
  if (!reference.binding.functionNode) return undefined;
  return reachableFrom(functionOf(reference.binding.functionNode)).get(binding);
}

function finding(binding, reference, via) {
  return {
    key: tdzKey(binding),
    binding: binding.name,
    line: reference.line,
    declarationLine: binding.line,
    via,
  };
}

/**
 * reachableFrom(fn) -> Map(binding -> chain of local function names, starting at fn), breadth-first so
 * each chain is a shortest one; memoised per function.
 */
function createReachability(references, functionOf) {
  const referencesByOwner = Map.groupBy(references, (reference) => reference.execOwner);
  const memo = new Map();
  return (start) => {
    if (!memo.has(start)) memo.set(start, collectReachable(start, referencesByOwner, functionOf));
    return memo.get(start);
  };
}

function collectReachable(start, referencesByOwner, functionOf) {
  const reached = new Map();
  const visited = new Set([start]);
  const queue = [{ fn: start, chain: [start.name] }];
  while (queue.length > 0) {
    const { fn, chain } = queue.shift();
    for (const reference of referencesByOwner.get(fn) ?? []) {
      if (!reached.has(reference.binding)) reached.set(reference.binding, chain);
      const callee = reference.binding.functionNode && functionOf(reference.binding.functionNode);
      if (callee && !visited.has(callee)) {
        visited.add(callee);
        queue.push({ fn: callee, chain: [...chain, callee.name] });
      }
    }
  }
  return reached;
}
