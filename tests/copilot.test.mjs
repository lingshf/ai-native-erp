import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { askCopilot } from '../src/copilot-ai.mjs';
import { createApp } from '../src/server.mjs';
import { Book } from '../src/book.mjs';

const model = 'gpt-6.1-sol';
const messages = [{ role: 'system', content: 'Accounting only.' }, { role: 'user', content: '{"request":"Explain"}' }];
const journal = { date: '2026-01-15', memo: 'Fictional revenue', kind: 'normal', rationale: 'Cash service',
  lines: [{ account: '1000', debit: '10', credit: '0' }, { account: '4000', debit: '0', credit: '10' }] };
function fake(overrides = {}) {
  const seen = { starts: 0, sends: 0, stops: 0, forces: 0, modelReads: 0 };
  const session = {
    rpc: { tools: { initializeAndValidate: async () => {},
      getCurrentMetadata: async () => ({ tools: Object.hasOwn(overrides, 'tools') ? overrides.tools : [] }) },
    model: { getCurrent: async () => ({ modelId: ++seen.modelReads > 1 && overrides.changedModel
      ? 'other-model' : overrides.selectedModel || model }) } },
    sendAndWait: async (request) => {
      seen.sends++; seen.prompt = request.prompt;
      if (overrides.hang) return new Promise(() => {});
      if (overrides.send) return overrides.send(seen);
      if (overrides.error) throw new Error('private upstream credential detail');
      const text = overrides.text ?? 'Fictional teaching.';
      seen.config.onEvent({ type: 'assistant.message', data: { content: text } });
      return { data: { content: text } };
    },
  };
  const clientFactory = (options) => {
    seen.options = options;
    return {
      start: async () => { seen.starts++; if (overrides.startError) throw new Error('private startup detail'); },
      getAuthStatus: async () => ({ isAuthenticated: overrides.auth !== false, authType: 'env' }),
      listModels: async () => overrides.noModel ? [] : [{ id: model }],
      createSession: async (config) => { seen.config = config; return session; },
      stop: async () => {
        seen.stops++;
        if (overrides.hangStop) return new Promise(() => {});
        return overrides.stopError ? [new Error('private cleanup detail')] : [];
      },
      forceStop: async () => { seen.forces++; if (overrides.forceError) throw new Error('private force-stop detail'); },
    };
  };
  return { seen, ai: { provider: 'copilot', model, clientFactory } };
}
async function removed(seen) {
  await assert.rejects(access(seen.options.baseDirectory), { code: 'ENOENT' });
}

test('Copilot is text-only, isolates state and filters unrelated credentials without exposing auth', async () => {
  const { ai, seen } = fake();
  const old = process.env.AI_API_KEY, oldUrl = process.env.AI_BASE_URL, oldCli = process.env.COPILOT_CLI_PATH;
  delete process.env.AI_API_KEY; delete process.env.AI_BASE_URL; delete process.env.COPILOT_CLI_PATH;
  process.env.Ai_Api_Key = 'unrelated-test-secret'; process.env.Ai_Base_Url = 'https://unrelated.example';
  process.env.Copilot_Cli_Path = 'test-runtime-must-not-be-inherited';
  try { assert.equal(await askCopilot(ai, messages), 'Fictional teaching.'); }
  finally {
    delete process.env.Ai_Api_Key; delete process.env.Ai_Base_Url; delete process.env.Copilot_Cli_Path;
    if (old === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = old;
    if (oldUrl === undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL = oldUrl;
    if (oldCli === undefined) delete process.env.COPILOT_CLI_PATH; else process.env.COPILOT_CLI_PATH = oldCli;
  }
  assert.equal(seen.options.mode, 'empty');
  assert.equal(seen.options.logLevel, 'none');
  assert.equal(seen.options.workingDirectory, seen.options.baseDirectory);
  assert.ok(seen.options.baseDirectory.startsWith(tmpdir()));
  assert.equal(seen.options.env.AI_API_KEY, undefined);
  assert.equal(seen.options.env.AI_BASE_URL, undefined);
  assert.equal(Object.keys(seen.options.env).some(k => ['AI_API_KEY', 'AI_BASE_URL', 'COPILOT_CLI_PATH'].includes(k.toUpperCase())), false);
  assert.deepEqual(seen.config.availableTools, []);
  assert.deepEqual(seen.config.excludedTools, ['builtin:*', 'mcp:*', 'custom:*']);
  assert.deepEqual(seen.config.mcpServers, {});
  assert.deepEqual(seen.config.customAgents, []);
  for (const key of ['enableConfigDiscovery', 'enableSkills', 'enableFileHooks', 'enableHostGitOperations',
    'enableSessionStore', 'enableOnDemandInstructionDiscovery', 'requestExtensions', 'requestCanvasRenderer',
    'enableMcpApps', 'enableSessionTelemetry']) assert.equal(seen.config[key], false, key);
  assert.equal(seen.config.skipCustomInstructions, true);
  assert.equal(seen.config.memory.enabled, false);
  assert.equal(seen.config.infiniteSessions.enabled, false);
  assert.deepEqual(seen.config.allowedModels, [model]);
  assert.equal(seen.config.systemMessage.mode, 'replace');
  assert.equal(seen.config.systemMessage.content, messages[0].content);
  assert.equal(seen.prompt, messages[1].content);
  assert.equal(seen.config.onPermissionRequest({}).kind, 'reject');
  assert.equal(seen.stops, 1);
  await removed(seen);
});

test('Copilot fails closed before inference for auth, model and tool-boundary failures', async () => {
  for (const overrides of [{ auth: false }, { noModel: true }, { tools: null }, { tools: [{ name: 'powershell' }] },
    { selectedModel: 'auto' }, { startError: true }]) {
    const { ai, seen } = fake(overrides);
    await assert.rejects(askCopilot(ai, messages), error => error.status >= 400 && !error.message.includes('private'));
    assert.equal(seen.sends, 0);
    assert.equal(seen.stops, 1);
    await removed(seen);
  }
});

test('Copilot enforces UTF-8 output limit, rejects malformed output and sanitizes runtime failures', async () => {
  const exact = '界'.repeat(87381) + 'x';
  assert.equal(Buffer.byteLength(exact), 262144);
  assert.equal(await askCopilot(fake({ text: exact }).ai, messages), exact);
  for (const overrides of [{ text: exact + 'x' }, { text: '' }, { error: true }, { changedModel: true },
    { send: async seen => { seen.config.onEvent({ type: 'assistant.message_delta', data: { deltaContent: exact + 'x' } }); return { data: { content: 'short' } }; } },
    { send: async seen => { seen.config.onEvent({ type: 'tool.execution_start', data: {} }); return { data: { content: 'not allowed' } }; } }]) {
    const { ai, seen } = fake(overrides);
    await assert.rejects(askCopilot(ai, messages), error => error.status === 502 && !error.message.includes('private'));
    await removed(seen);
  }
});

test('Copilot timeout and cleanup failures are explicit, bounded and force-stop when necessary', async () => {
  for (const overrides of [{ hang: true }, { hangStop: true }, { stopError: true }]) {
    const { ai, seen } = fake(overrides);
    await assert.rejects(askCopilot(ai, messages, { timeoutMs: 25, cleanupTimeoutMs: 25 }),
      error => [502, 504].includes(error.status) && !error.message.includes('private'));
    assert.ok(seen.forces >= 1);
    await removed(seen);
  }
});

test('Copilot rejects concurrent requests before another runtime starts', async () => {
  const first = fake({ hang: true }), second = fake();
  const pending = assert.rejects(askCopilot(first.ai, messages, { timeoutMs: 40 }), /超时/);
  await assert.rejects(askCopilot(second.ai, messages), error => error.status === 409);
  assert.equal(second.seen.starts, 0);
  await pending;
});

test('Copilot retains temporary state and reports cleanup failure if runtime termination is unconfirmed', async () => {
  const { ai, seen } = fake({ stopError: true, forceError: true });
  const logs = [], original = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  try {
    await assert.rejects(askCopilot(ai, messages), error => error.status === 502 && /清理失败/.test(error.message));
    await access(seen.options.baseDirectory);
    assert.ok(logs.some(line => line.includes('termination unconfirmed')));
    assert.ok(!logs.join(' ').includes('private'));
  } finally {
    console.error = original;
    if (seen.options?.baseDirectory) await rm(seen.options.baseDirectory, { recursive: true, force: true });
  }
});

test('Copilot HTTP integration preserves teaching context, draft validation, origin guards and zero writes', async t => {
  let bad = false, calls = 0, last;
  const book = new Book(':memory:', { today: '2026-01-15' });
  const before = JSON.stringify({ journals: book.journals(), periods: book.periods() });
  const server = createApp({ book, ai: { provider: 'copilot', model, clientFactory: options => {
    calls++;
    const f = fake({ text: bad ? JSON.stringify({ ...journal, kind: 'closing' }) : JSON.stringify(journal) });
    const client = f.ai.clientFactory(options);
    const create = client.createSession;
    client.createSession = async config => { last = f.seen; return create(config); };
    return client;
  } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { book.close(); resolve(); }); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, headers = {}) => fetch(base + path, { method: 'POST',
    headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ month: '2026-01', prompt: 'Fictional revenue' }) });
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.aiConfigured, true);
  assert.equal(state.aiProvider, 'copilot');
  assert.equal(state.aiModel, model);
  assert.equal((await send('/api/ai/teach', { origin: 'https://foreign.example' })).status, 403);
  assert.equal(calls, 0);
  assert.equal((await send('/api/ai/teach')).status, 200);
  const context = JSON.parse(last.prompt);
  assert.equal(context.period.status, 'open');
  assert.equal(context.closing.canClose, true);
  assert.deepEqual(context.money, { unit: '教学单位', minorUnitsPerUnit: 100 });
  assert.match(last.config.systemMessage.content, /integer minor units/);
  assert.match(last.config.systemMessage.content, /teaching units/);
  const valid = await send('/api/ai/draft');
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).proposal.lines[0].debit, '10.00');
  assert.deepEqual(JSON.parse(last.prompt).money, context.money);
  assert.equal(Object.hasOwn(JSON.parse(last.prompt), 'closing'), false);
  assert.match(last.config.systemMessage.content, /integer minor units/);
  assert.match(last.config.systemMessage.content, /decimal strings in teaching units/);
  bad = true;
  assert.equal((await send('/api/ai/draft')).status, 502);
  assert.equal(JSON.stringify({ journals: book.journals(), periods: book.periods() }), before);
});
