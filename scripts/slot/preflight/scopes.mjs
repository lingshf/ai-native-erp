// Scope analysis for the TDZ check (S12 SLOT-02): bindings, identifier references and the function each
// reference executes in, for one Babel AST. It covers only what the TDZ rule needs; TypeScript type
// positions never execute, so they are skipped.
//
// "Executes in" (execOwner): a function expression or arrow passed straight to a call (a test callback,
// an IIFE, a .map callback) is assumed to run where it is written, so its references belong to the
// enclosing function. Any other function (declaration, function-valued variable, method, assigned arrow)
// runs only when called, so its references belong to itself.

export const TDZ_KINDS = new Set(["let", "const", "class"]);

const PROGRAM_NAME = "";
const ANONYMOUS = "<anonymous>";
const SKIPPED_KEYS = new Set([
  "type",
  "start",
  "end",
  "loc",
  "range",
  "extra",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "typeAnnotation",
  "returnType",
  "typeParameters",
  "typeArguments",
  "superTypeParameters",
  "implements",
  "predicate",
]);
const TS_EXPRESSION_WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
]);

/**
 * Two passes over the same walk: "declare" records every binding first (so `var` and hoisted
 * functions are known before any reference), "resolve" then resolves each identifier reference.
 */
export function analyzeScopes(ast) {
  const state = {
    mode: "declare",
    scopeByNode: new Map(),
    functionByNode: new Map(),
    bindings: [],
    references: [],
  };
  walkProgram(ast.program, state);
  state.mode = "resolve";
  walkProgram(ast.program, state);
  return {
    bindings: state.bindings,
    references: state.references,
    functionOf: (node) => state.functionByNode.get(node),
  };
}

/** Enclosing function names from the outermost down, e.g. ["tradeGuiScenario", "test()"]. */
export function functionPath(fn) {
  const names = [];
  for (let current = fn; current && current.name !== PROGRAM_NAME; current = current.parent) {
    names.unshift(current.name);
  }
  return names;
}

function walkProgram(program, state) {
  const fn = functionInfo(program, PROGRAM_NAME, null, false, state);
  const scope = scopeFor(program, null, fn, true, state);
  walkList(program.body, { scope, fn, state });
}

function functionInfo(node, name, parent, runsInline, state) {
  let info = state.functionByNode.get(node);
  if (!info) {
    info = { node, name, parent, execOwner: null };
    info.execOwner = runsInline ? parent.execOwner : info;
    state.functionByNode.set(node, info);
  }
  return info;
}

function scopeFor(node, parent, fn, isFunctionScope, state) {
  let scope = state.scopeByNode.get(node);
  if (!scope) {
    scope = { node, parent, fn, isFunctionScope, bindings: new Map() };
    state.scopeByNode.set(node, scope);
  }
  return scope;
}

function blockContext(node, ctx) {
  return { ...ctx, scope: scopeFor(node, ctx.scope, ctx.fn, false, ctx.state) };
}

function walk(node, ctx) {
  if (!node || typeof node.type !== "string") return;
  const handler = HANDLERS[node.type];
  if (handler) handler(node, ctx);
  else if (node.type.startsWith("TS")) walkTypeScript(node, ctx);
  else walkChildren(node, ctx);
}

function walkChildren(node, ctx) {
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue;
    if (Array.isArray(value)) walkList(value, ctx);
    else if (value && typeof value.type === "string") walk(value, ctx);
  }
}

function walkList(nodes, ctx) {
  for (const node of nodes) walk(node, ctx);
}

function walkTypeScript(node, ctx) {
  if (TS_EXPRESSION_WRAPPERS.has(node.type)) walk(node.expression, ctx);
  // An enum compiles to a `var`, so it shadows but has no TDZ.
  else if (node.type === "TSEnumDeclaration") declare(node.id, "enum", node, null, ctx);
}

const skip = () => {};

const HANDLERS = {
  Identifier: (node, ctx) => reference(node, ctx),
  MemberExpression: walkMember,
  OptionalMemberExpression: walkMember,
  ObjectProperty: (node, ctx) => {
    if (node.computed) walk(node.key, ctx);
    walk(node.value, ctx);
  },
  ObjectMethod: walkMethod,
  ClassMethod: walkMethod,
  ClassPrivateMethod: walkMethod,
  ClassProperty: walkClassField,
  ClassPrivateProperty: walkClassField,
  ClassAccessorProperty: walkClassField,
  FunctionDeclaration: (node, ctx) => {
    if (node.id) declare(node.id, "function", node, node, ctx);
    walkFunction(node, ctx, node.id?.name ?? "default", false);
  },
  FunctionExpression: (node, ctx) => walkFunction(node, ctx, node.id?.name ?? ANONYMOUS, false),
  ArrowFunctionExpression: (node, ctx) => walkFunction(node, ctx, ANONYMOUS, false),
  CallExpression: walkCall,
  OptionalCallExpression: walkCall,
  NewExpression: walkCall,
  VariableDeclaration: walkVariableDeclaration,
  ClassDeclaration: (node, ctx) => {
    if (node.id) declare(node.id, "class", node, null, ctx);
    walkClass(node, ctx);
  },
  ClassExpression: walkClass,
  BlockStatement: (node, ctx) => walkList(node.body, blockContext(node, ctx)),
  ForStatement: (node, ctx) => walkChildren(node, blockContext(node, ctx)),
  ForInStatement: (node, ctx) => walkChildren(node, blockContext(node, ctx)),
  ForOfStatement: (node, ctx) => walkChildren(node, blockContext(node, ctx)),
  SwitchStatement: (node, ctx) => {
    walk(node.discriminant, ctx);
    walkList(node.cases, blockContext(node, ctx));
  },
  CatchClause: walkCatchClause,
  LabeledStatement: (node, ctx) => walk(node.body, ctx),
  BreakStatement: skip,
  ContinueStatement: skip,
  ImportDeclaration: (node, ctx) => {
    for (const specifier of node.specifiers) declare(specifier.local, "import", node, null, ctx);
  },
  ExportNamedDeclaration: (node, ctx) => walk(node.declaration, ctx),
  ExportDefaultDeclaration: (node, ctx) => walk(node.declaration, ctx),
  ExportAllDeclaration: skip,
  MetaProperty: skip,
  PrivateName: skip,
  JSXOpeningElement: (node, ctx) => {
    walkJsxName(node.name, ctx);
    walkList(node.attributes, ctx);
  },
  JSXClosingElement: skip,
  JSXAttribute: (node, ctx) => walk(node.value, ctx),
};

function walkMember(node, ctx) {
  walk(node.object, ctx);
  if (node.computed) walk(node.property, ctx);
}

function walkMethod(node, ctx) {
  if (node.computed) walk(node.key, ctx);
  walkFunction(node, ctx, keyName(node.key), false);
}

// A field initializer runs when an instance is built, not where the class is written.
function walkClassField(node, ctx) {
  if (node.computed) walk(node.key, ctx);
  const fn = functionInfo(node, keyName(node.key), ctx.fn, false, ctx.state);
  walk(node.value, { ...ctx, fn });
}

function walkClass(node, ctx) {
  walk(node.superClass, ctx);
  walkList(node.body.body, ctx);
}

function walkCatchClause(node, ctx) {
  const inner = blockContext(node, ctx);
  if (node.param) {
    declarePattern(node.param, "let", node, inner);
    walkPatternExpressions(node.param, inner);
  }
  walk(node.body, inner);
}

function walkJsxName(name, ctx) {
  // Lower-case JSX names are intrinsic elements, not references.
  if (name.type === "JSXIdentifier" && /^[A-Z]/.test(name.name)) reference(name, ctx);
  else if (name.type === "JSXMemberExpression") walkJsxName(name.object, ctx);
}

function walkCall(node, ctx) {
  const label = `${calleeLabel(node.callee)}()`;
  if (isInlineFunction(node.callee)) walkFunction(node.callee, ctx, label, true);
  else walk(node.callee, ctx);
  for (const argument of node.arguments) {
    if (isInlineFunction(argument)) walkFunction(argument, ctx, label, true);
    else walk(argument, ctx);
  }
}

function walkVariableDeclaration(node, ctx) {
  // Each declarator is its own declaration point: in `const first = later, later = 1;` the reference to
  // `later` runs before `later`'s declarator, and `const a = 1, b = a;` reads an initialized `a`.
  for (const declarator of node.declarations) {
    const functionValue = isInlineFunction(declarator.init) ? declarator.init : null;
    if (declarator.id.type === "Identifier") {
      declare(declarator.id, node.kind, declarator, functionValue, ctx);
    } else {
      declarePattern(declarator.id, node.kind, declarator, ctx);
    }
    walkPatternExpressions(declarator.id, ctx);
    if (functionValue) walkFunction(functionValue, ctx, declarator.id.name, false);
    else walk(declarator.init, ctx);
  }
}

function walkFunction(node, ctx, name, runsInline) {
  const fn = functionInfo(node, name, ctx.fn, runsInline, ctx.state);
  const inner = { ...ctx, fn, scope: scopeFor(node, ctx.scope, fn, true, ctx.state) };
  if (node.type === "FunctionExpression" && node.id)
    declare(node.id, "function", node, node, inner);
  for (const param of node.params) {
    declarePattern(param, "param", node, inner);
    walkPatternExpressions(param, inner);
  }
  if (node.body.type === "BlockStatement") walkList(node.body.body, inner);
  else walk(node.body, inner);
}

function declare(id, kind, declarationNode, functionNode, ctx) {
  if (ctx.state.mode !== "declare") return;
  const scope = kind === "var" ? nearestFunctionScope(ctx.scope) : ctx.scope;
  if (scope.bindings.has(id.name)) return;
  const binding = {
    name: id.name,
    kind,
    scope,
    declarationStart: declarationNode.start,
    line: id.loc.start.line,
    functionNode,
  };
  scope.bindings.set(id.name, binding);
  ctx.state.bindings.push(binding);
}

function declarePattern(pattern, kind, declarationNode, ctx) {
  for (const id of patternIdentifiers(pattern)) declare(id, kind, declarationNode, null, ctx);
}

function* patternIdentifiers(pattern) {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      yield pattern;
      break;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        yield* patternIdentifiers(
          property.type === "RestElement" ? property.argument : property.value,
        );
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) yield* patternIdentifiers(element);
      break;
    case "AssignmentPattern":
      yield* patternIdentifiers(pattern.left);
      break;
    case "RestElement":
      yield* patternIdentifiers(pattern.argument);
      break;
    case "TSParameterProperty":
      yield* patternIdentifiers(pattern.parameter);
      break;
  }
}

// The parts of a binding pattern that do execute: default values and computed keys.
function walkPatternExpressions(pattern, ctx) {
  if (!pattern) return;
  switch (pattern.type) {
    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (property.type === "RestElement") continue;
        if (property.computed) walk(property.key, ctx);
        walkPatternExpressions(property.value, ctx);
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) walkPatternExpressions(element, ctx);
      break;
    case "AssignmentPattern":
      walkPatternExpressions(pattern.left, ctx);
      walk(pattern.right, ctx);
      break;
    case "TSParameterProperty":
      walkPatternExpressions(pattern.parameter, ctx);
      break;
  }
}

function reference(node, ctx) {
  if (ctx.state.mode !== "resolve") return;
  const binding = resolve(node.name, ctx.scope);
  if (!binding) return;
  ctx.state.references.push({
    binding,
    start: node.start,
    line: node.loc.start.line,
    scope: ctx.scope,
    execOwner: ctx.fn.execOwner,
  });
}

function resolve(name, scope) {
  for (let current = scope; current; current = current.parent) {
    const binding = current.bindings.get(name);
    if (binding) return binding;
  }
  return undefined;
}

function nearestFunctionScope(scope) {
  let current = scope;
  while (!current.isFunctionScope) current = current.parent;
  return current;
}

function isInlineFunction(node) {
  return node?.type === "FunctionExpression" || node?.type === "ArrowFunctionExpression";
}

function calleeLabel(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return keyName(callee.property);
  return ANONYMOUS;
}

function keyName(key) {
  return key.name ?? key.id?.name ?? (typeof key.value === "string" ? key.value : ANONYMOUS);
}
