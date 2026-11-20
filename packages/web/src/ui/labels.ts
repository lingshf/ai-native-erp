import { reportEn, reportZh } from "./report-labels.ts";
import { migrationEn, migrationZh } from "./migration-labels.ts";
import { masterEn, masterZh } from "./master-labels.ts";
import { dimensionEn, dimensionZh } from "./dimension-labels.ts";
import { journalEn, journalZh } from "./journal-labels.ts";
import { businessEn, businessZh } from "./business-labels.ts";
import { ledgerEn, ledgerZh } from "./ledger-labels.ts";
import { closeEn, closeZh } from "./close-labels.ts";
import { aiEn, aiZh } from "./ai-labels.ts";
import { tradeEn, tradeZh } from "./trade-labels.ts";
import { tradeReportEn, tradeReportZh } from "./trade-report-labels.ts";

export const zh = {
  ...migrationZh,
  ...tradeReportZh,
  ...tradeZh,
  ...aiZh,
  ...closeZh,
  ...ledgerZh,
  ...businessZh,
  ...journalZh,
  ...dimensionZh,
  ...reportZh,
  ...masterZh,
  "shell.title": "ERP 工作区",
  "shell.documentTitle": "ERP 工作区",
  "shell.navigation": "工作区导航",
  "shell.overview": "运行状态",
  "shell.skip": "跳转到主要内容",
  "shell.preferences": "显示偏好",
  "shell.language": "语言",
  "shell.languageZh": "中文",
  "shell.languageEn": "English",
  "shell.theme": "主题",
  "shell.themeRed": "专业红",
  "shell.themeGreen": "专业绿",
  "shell.showTeachingExplanations": "显示教学说明",
  "shell.intro":
    "此工作区提供公司科目与维度维护、凭证预览确认、当前账套总账报表与结账、独立的已验证快照报表，以及仅生成候选的 AI 助手。",
  "shell.healthHeading": "本地 API 状态",
  "shell.healthLoading": "正在读取本地 API 状态…",
  "shell.connected": "本地 API 已连接",
  "shell.service": "服务",
  "shell.contract": "契约版本",
  "shell.profile": "运行档案",
  "shell.local": "本地",
  "shell.data": "数据状态",
  "shell.unconfigured": "目标业务账套未配置",
  "shell.dataWarning":
    "尚未连接目标业务账套。若已启动经校验的快照，可在只读报表查看；此处不提供财务写入。",
  "shell.teachingTitle": "教学说明",
  "shell.teachingNote":
    "状态由同源的只读 health 接口实时返回。连接成功并不代表目标业务账套已配置。",
  "shell.compatible": "与本工作区兼容",
  "shell.uiLoading": "正在加载界面组件…",
  "shell.uiFailed": "界面组件加载失败，当前为简化显示；运行状态与重试仍可用。",
  "shell.uiReload": "重新加载页面",
  "shell.networkError": "无法连接本地 API。请检查服务后重试。",
  "shell.invalidResponse": "本地 API 返回了不符合契约的响应。未确认连接状态。",
  "shell.httpError": "本地 API 请求失败（HTTP {status}）。请检查服务后重试。",
  "shell.retry": "重试连接",
  "shell.preferenceErrors": "偏好设置警告",
  "shell.storageRead": "无法读取已保存的偏好，正在使用默认设置。",
  "shell.storageCorrupt": "已保存的偏好无效，已恢复默认设置。",
  "shell.storageWrite": "无法保存偏好。当前设置保持不变；请检查浏览器存储权限后重试。",
} as const;

export type LabelKey = keyof typeof zh;
export type Language = "zh" | "en";
export type LabelResources = Readonly<Record<LabelKey, string>>;

export const en = {
  ...migrationEn,
  ...tradeReportEn,
  ...tradeEn,
  ...aiEn,
  ...closeEn,
  ...ledgerEn,
  ...journalEn,
  ...businessEn,
  ...dimensionEn,
  ...reportEn,
  ...masterEn,
  "shell.title": "ERP workspace",
  "shell.documentTitle": "ERP workspace",
  "shell.navigation": "Workspace navigation",
  "shell.overview": "Runtime status",
  "shell.skip": "Skip to main content",
  "shell.preferences": "Display preferences",
  "shell.language": "Language",
  "shell.languageZh": "中文",
  "shell.languageEn": "English",
  "shell.theme": "Theme",
  "shell.themeRed": "Professional red",
  "shell.themeGreen": "Professional green",
  "shell.showTeachingExplanations": "Show teaching explanations",
  "shell.intro":
    "This workspace provides company accounts and dimensions, journal preview/confirmation, live ledger reports and period close, separate verified-snapshot reports, and a candidate-only AI assistant.",
  "shell.healthHeading": "Local API status",
  "shell.healthLoading": "Reading local API status…",
  "shell.connected": "Local API connected",
  "shell.service": "Service",
  "shell.contract": "Contract version",
  "shell.profile": "Runtime profile",
  "shell.local": "Local",
  "shell.data": "Data status",
  "shell.unconfigured": "Target business ledger unconfigured",
  "shell.dataWarning":
    "The target business ledger is not connected. Verified snapshots, when started, are available under Read-only reports. Financial writes are not available.",
  "shell.teachingTitle": "Teaching note",
  "shell.teachingNote":
    "Status is returned live by the same-origin, read-only health endpoint. A successful connection does not mean the target business ledger is configured.",
  "shell.compatible": "Compatible with this workspace",
  "shell.uiLoading": "Loading interface components…",
  "shell.uiFailed":
    "Interface components failed to load; showing a simplified view. Status and retry still work.",
  "shell.uiReload": "Reload page",
  "shell.networkError": "Cannot connect to the local API. Check the service and retry.",
  "shell.invalidResponse":
    "The local API returned a response that does not match the contract. Connection status is unconfirmed.",
  "shell.httpError": "The local API request failed (HTTP {status}). Check the service and retry.",
  "shell.retry": "Retry connection",
  "shell.preferenceErrors": "Preference warnings",
  "shell.storageRead": "Saved preferences could not be read. Default settings are in use.",
  "shell.storageCorrupt": "Saved preferences are invalid. Default settings have been restored.",
  "shell.storageWrite":
    "Preferences could not be saved. Current settings are unchanged; check browser storage permissions and retry.",
} as const satisfies LabelResources;

export const resources = { zh, en } as const;

type Placeholders<S extends string> = S extends `${string}{${infer Key}}${infer Rest}`
  ? Key | Placeholders<Rest>
  : never;
type LabelArguments<K extends LabelKey> = [Placeholders<(typeof en)[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<(typeof en)[K]>, string | number>>];

export function label<K extends LabelKey>(
  language: Language,
  key: K,
  ...args: LabelArguments<K>
): string {
  const template: string = resources[language][key];
  const params = args[0] as Readonly<Record<string, string | number>> | undefined;
  return template.replace(/\{([^{}]+)\}/g, (_match: string, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Missing label parameter: ${name}`);
    return String(value);
  });
}
