import { CopilotClient } from '@github/copilot-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from './book.mjs';

const LIMIT = 262144;
let busy = false;
const fail = (message, status = 502) => new AppError(message, status);

export async function askCopilot(ai, messages, { timeoutMs = 30000, cleanupTimeoutMs = 5000 } = {}) {
  if (busy) throw fail('另一个 Copilot 请求仍在处理，请稍后重试。', 409);
  if (typeof ai.model !== 'string' || !ai.model.trim() || ai.model === 'auto') {
    throw fail('Copilot 需要配置明确的 AI_MODEL，不能使用 auto。', 503);
  }
  busy = true;
  let directory, client, timer, cancelled = false, timedOut = false;
  try {
    directory = await mkdtemp(join(tmpdir(), 'ai-native-erp-copilot-'));
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !['AI_API_KEY', 'AI_BASE_URL', 'COPILOT_CLI_PATH'].includes(key.toUpperCase())));
    client = (ai.clientFactory ?? (options => new CopilotClient(options)))({
      mode: 'empty', baseDirectory: directory, workingDirectory: directory, logLevel: 'none', env,
    });
    let rejectEvent;
    const interrupted = new Promise((_, reject) => {
      rejectEvent = error => { cancelled = true; reject(error); };
      timer = setTimeout(() => { timedOut = true; rejectEvent(fail('AI 请求超时，请重试。', 504)); }, timeoutMs);
    });
    const checked = async promise => {
      const value = await promise;
      if (cancelled) throw fail('Copilot 请求已中止。');
      return value;
    };
    const run = async () => {
      await checked(client.start());
      const auth = await checked(client.getAuthStatus());
      if (!auth.isAuthenticated) throw fail('Copilot 未认证；当前运行环境须提供官方 SDK 支持的认证。手工记账仍可使用。', 503);
      const models = await checked(client.listModels());
      if (!models.some(model => model.id === ai.model)) throw fail('当前 Copilot 服务未提供配置的模型，请检查 AI_MODEL。', 503);
      let bytes = 0, finalMessages = 0;
      const session = await checked(client.createSession({
        model: ai.model, allowedModels: [ai.model], reasoningSummary: 'none',
        availableTools: [], excludedTools: ['builtin:*', 'mcp:*', 'custom:*'],
        tools: [], mcpServers: {}, customAgents: [], includedBuiltinSkills: [],
        enableConfigDiscovery: false, skipCustomInstructions: true,
        enableOnDemandInstructionDiscovery: false, enableSkills: false, enableFileHooks: false,
        enableHostGitOperations: false, enableSessionStore: false, enableSessionTelemetry: false,
        requestExtensions: false, requestCanvasRenderer: false, enableMcpApps: false,
        memory: { enabled: false }, infiniteSessions: { enabled: false },
        systemMessage: { mode: 'replace', content: messages.filter(m => m.role === 'system').map(m => m.content).join('\n') },
        onPermissionRequest: () => ({ kind: 'reject', feedback: 'This application permits no tools or file access.' }),
        streaming: true,
        onEvent: event => {
          if (event.type.startsWith('tool.') || event.type.startsWith('subagent.')) {
            rejectEvent(fail('Copilot 触发了被禁用的工具或代理，请求已中止。'));
          }
          if (event.type === 'assistant.message_delta') {
            bytes += Buffer.byteLength(event.data.deltaContent ?? '', 'utf8');
            if (bytes > LIMIT) rejectEvent(fail('AI 响应过大（上限 256 KiB）。'));
          }
          if (event.type === 'assistant.message' && ++finalMessages > 1) {
            rejectEvent(fail('Copilot 返回了非单次文本响应，请求已中止。'));
          }
        },
      }));
      await checked(session.rpc.tools.initializeAndValidate());
      const tools = await checked(session.rpc.tools.getCurrentMetadata());
      if (!Array.isArray(tools.tools) || tools.tools.length) throw fail('无法确认 Copilot 工具已全部禁用，未发送问题。');
      const verifyModel = async () => {
        const selected = await checked(session.rpc.model.getCurrent());
        if (selected.modelId !== ai.model) throw fail('Copilot 实际选择的模型与配置不符，请求已中止。');
      };
      await verifyModel();
      const response = await checked(session.sendAndWait({
        prompt: messages.filter(m => m.role === 'user').map(m => m.content).join('\n'),
      }, timeoutMs));
      await verifyModel();
      const text = response?.data?.content;
      if (typeof text !== 'string' || !text.trim() || finalMessages !== 1) throw fail('AI 返回格式无效或内容为空。');
      if (Buffer.byteLength(text, 'utf8') > LIMIT) throw fail('AI 响应过大（上限 256 KiB）。');
      return text;
    };
    return await Promise.race([run(), interrupted]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw fail('Copilot 连接失败，请检查当前运行环境的官方 SDK 认证、网络和额度。');
  } finally {
    clearTimeout(timer);
    let cleanupFailed = false, cleanupTimer, terminated = !client;
    try {
      if (client) {
        if (timedOut || cancelled) { await client.forceStop(); terminated = true; }
        else {
          const errors = await Promise.race([client.stop(),
            new Promise(resolve => { cleanupTimer = setTimeout(() => resolve(null), cleanupTimeoutMs); })]);
          if (!Array.isArray(errors) || errors.length) {
            cleanupFailed = true;
            await client.forceStop();
          }
          terminated = true;
        }
      }
    } catch {
      cleanupFailed = true;
      if (client) {
        try { await client.forceStop(); terminated = true; }
        catch { console.error('Copilot runtime termination failed.'); }
      }
    } finally {
      clearTimeout(cleanupTimer);
      if (directory && terminated) {
        try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
        catch { cleanupFailed = true; console.error('Copilot temporary state cleanup failed.'); }
      }
      if (directory && !terminated) console.error('Copilot temporary state retained: runtime termination unconfirmed.');
      busy = false;
    }
    if (cleanupFailed) throw fail('Copilot 临时会话清理失败，未返回 AI 结果；请检查本机临时目录或重启服务。');
  }
}
