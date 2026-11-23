// 替身（Demo v0.11.0，PROC-04 要求 11）：在回环临时端口起一个带状态的假服务，原样运行 seed-detail.mjs（或它的改动副本），按产品规则校验请求并断言请求日志。
// 前置数据（seed-trade / seed-invoicing / seed-sales 的结果）由替身直接预置：伙伴 PARTY、PARTY2；已有 6 张发票 AP-DEMO、AP-DEMO2、AP-I1-1、AP-I2-1（PARTY / PARTY2 采购）和 AR-I1-1、AR-I2-1（PARTY2 销售，AR-I1-1 合计 135.60）。
// 这些前置脚本本身由 v0.10.0 的 stub-check.ps1 覆盖，这里不重复。
// 用法：node seed-detail-stub.mjs <模式> <脚本路径>
//   pass         seed-detail.mjs 退出 0，请求日志恰好 222 条：公司 1、订单 1、发票预览 + 过账各 106（AP-D1-1、AP-EARLY-1..3、BULK-001..102）、列表查询 4、详情查询 2、核销预览 + 过账各 1；
//                末尾 8 条顺序固定；AR-I1-1 核销 5000（不取折扣）后未结 8560、1 条核销记录；DEFAULT 共 112 张。
//   no-ar        预置里没有 AR-I1-1（没跑 seed-sales）：退出 1，输出含 “AR-I1-1 不存在”，日志停在 AR-I1-1 的列表查询（215 条），没有任何核销请求。
//   overpay      脚本副本把核销金额改成 20000（大于未结 13560）：退出 1，日志停在核销预览被拒 api.error.tradeDocument.quantity items.0，没有核销过账。
//   day-first    day 取当月 1 日：脚本在发任何请求之前退出 1，日志为空。
//   参数不对、模式未知时退出 2（不算通过）。
// 规则来源（产品代码，以代码为准）：
//   核销：application/trade-documents.ts:410–418（项目存在、伙伴 / 方向 / 币种一致、修订号一致、金额不得超过未结，规则名 reference / party / currency / stale / quantity）
//   发票关联订单与数量上限：application/trade-documents.ts:873–899、domain/trade-documents.ts:784–796（同 v0.10.0 替身）
//   过账须带预览指纹与确认词 POST：infra/http/trade-documents.ts:175–190
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const [mode, scriptPath] = process.argv.slice(2);
const modes = ["pass", "no-ar", "overpay", "day-first"];
if (!modes.includes(mode ?? "") || !scriptPath) {
  console.error("usage: seed-detail-stub.mjs <pass|no-ar|overpay|day-first> <script path>");
  process.exit(2);
}
const today = new Date().toISOString().slice(0, 10);
const day = today.endsWith("-01") ? `${today.slice(0, 8)}02` : today;
const first = `${day.slice(0, 7)}-01`;
const scriptDay = mode === "day-first" ? first : day;
const micros = (text) => Math.round(Number(text) * 1_000_000);
const rejectIn = (path, rule) => ({ status: 400, body: { fieldErrors: [{ path, messageKey: `api.error.tradeDocument.${rule}` }] } });
const log = [];
const companies = new Set(["DEFAULT"]);
const parties = new Set(["PARTY", "PARTY2"]);
const orders = new Map();
const invoiced = new Map();
const previews = new Map();
const invoices = new Map();
let nextId = 1;
const preset = (side, party, externalNo, gross) => {
  const documentId = `pre-${nextId++}`;
  invoices.set(documentId, { documentId, side, party, externalNo, accountingDate: day, gross, remaining: gross, revision: 1, settlements: [] });
};
preset("AP", "PARTY", "AP-DEMO", 11300);
preset("AP", "PARTY2", "AP-DEMO2", 11300);
preset("AP", "PARTY", "AP-I1-1", 4520);
preset("AP", "PARTY", "AP-I2-1", 11300);
if (mode !== "no-ar") preset("AR", "PARTY2", "AR-I1-1", 13560);
preset("AR", "PARTY2", "AR-I2-1", 33900);
const presetCount = invoices.size;

const gross = (command) => {
  let total = 0;
  for (const line of command.lines) {
    const net = Math.round((micros(line.quantity) * micros(line.unitPrice)) / 10_000_000_000);
    total += net + Math.round(net * 0.13);
  }
  return total;
};
const fingerprintOf = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sorted = () => [...invoices.values()].sort((a, b) => a.externalNo.localeCompare(b.externalNo));

function handle(method, url, body) {
  const parsed = new URL(url, "http://stub");
  const path = parsed.pathname;
  const q = parsed.searchParams;
  if (method === "GET" && path === "/ready") return { status: 200, body: {} };
  if (method === "POST" && path === "/api/v1/companies") {
    if (!body.code || companies.has(body.code)) return { status: 409, body: {} };
    companies.add(body.code);
    return { status: 201, body: {} };
  }
  if (method === "POST" && path === "/api/v1/trade/orders") {
    if (!parties.has(body.party)) return rejectIn("party", "reference");
    if (orders.has(body.orderId)) return { status: 409, body: {} };
    orders.set(body.orderId, body);
    return { status: 201, body: {} };
  }
  if (method === "POST" && (path === "/api/v1/trade/invoices/preview" || path === "/api/v1/trade/invoices")) {
    const posting = path === "/api/v1/trade/invoices";
    if (posting && (body.confirmation !== "POST" || !body.idempotencyKey)) return rejectIn("confirmation", "shape");
    const command = posting ? body.command : body;
    if (!parties.has(command.party)) return rejectIn("party", "reference");
    const order = command.orderId === null ? null : orders.get(command.orderId);
    if (command.orderId !== null) {
      if (!order) return rejectIn("orderId", "order");
      if (command.side !== order.side || command.party !== order.party) return rejectIn("orderId", "order");
      for (const [index, line] of command.lines.entries()) {
        const orderLine = order.lines.find((item) => item.lineId === line.orderLineId);
        if (!orderLine) return rejectIn(`lines.${index}.orderLineId`, "orderLine");
        if ((invoiced.get(`${command.orderId}/${line.orderLineId}`) ?? 0) + micros(line.quantity) > micros(orderLine.quantity)) return rejectIn(`lines.${index}.quantity`, "quantity");
      }
    }
    const fingerprint = fingerprintOf(command);
    if (!posting) {
      previews.set(fingerprint, true);
      return { status: 200, body: { fingerprint, calculation: { gross: gross(command) } } };
    }
    if (body.fingerprint !== fingerprint || !previews.has(fingerprint)) return rejectIn("fingerprint", "stale");
    if (order) for (const line of command.lines) invoiced.set(`${command.orderId}/${line.orderLineId}`, (invoiced.get(`${command.orderId}/${line.orderLineId}`) ?? 0) + micros(line.quantity));
    invoices.set(command.documentId, { documentId: command.documentId, side: command.side, party: command.party, externalNo: command.externalInvoice, accountingDate: command.accountingDate, gross: gross(command), remaining: gross(command), revision: 1, settlements: [] });
    return { status: 201, body: {} };
  }
  if (method === "GET" && path === "/api/v1/trade/invoices") {
    const limit = Number(q.get("limit") ?? 100);
    const offset = Number(q.get("cursor") ?? 0);
    const match = sorted().filter(
      (item) => (!q.get("side") || item.side === q.get("side")) && (!q.get("party") || item.party === q.get("party")) && (!q.get("from") || item.accountingDate >= q.get("from")) && (!q.get("to") || item.accountingDate <= q.get("to")),
    );
    const items = match.slice(offset, offset + limit).map((item) => ({ documentId: item.documentId, externalNo: item.externalNo, party: item.party, side: item.side }));
    return { status: 200, body: { items, nextCursor: offset + limit < match.length ? String(offset + limit) : null } };
  }
  const detail = /^\/api\/v1\/trade\/invoices\/([^/]+)$/u.exec(path);
  if (method === "GET" && detail) {
    const item = invoices.get(detail[1]);
    if (!item) return { status: 404, body: { code: "NOT_FOUND" } };
    return { status: 200, body: { document: { gross: item.gross }, openItem: { remainingGross: item.remaining, revision: item.revision }, settlements: item.settlements } };
  }
  if (method === "POST" && (path === "/api/v1/trade/settlements/preview" || path === "/api/v1/trade/settlements")) {
    const posting = path === "/api/v1/trade/settlements";
    if (posting && (body.confirmation !== "POST" || !body.idempotencyKey)) return rejectIn("confirmation", "shape");
    const command = posting ? body.command : body;
    for (const [index, selection] of command.items.entries()) {
      const where = `items.${index}`;
      const item = invoices.get(selection.itemId);
      if (!item) return rejectIn(where, "reference");
      if (item.party !== command.party || item.side !== command.side) return rejectIn(where, "party");
      if (item.revision !== selection.revision) return rejectIn(where, "stale");
      if (selection.gross > item.remaining) return rejectIn(where, "quantity");
    }
    const fingerprint = fingerprintOf(command);
    if (!posting) {
      previews.set(fingerprint, true);
      return { status: 200, body: { fingerprint } };
    }
    if (body.fingerprint !== fingerprint || !previews.has(fingerprint)) return rejectIn("fingerprint", "stale");
    for (const selection of command.items) {
      const item = invoices.get(selection.itemId);
      item.remaining -= selection.gross;
      item.revision += 1;
      item.settlements.push({ paymentId: command.paymentId, gross: selection.gross, takeDiscount: selection.takeDiscount });
    }
    return { status: 201, body: {} };
  }
  return { status: 404, body: {} };
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const result = handle(req.method, req.url, body);
    if (req.url !== "/ready") {
      const path = new URL(req.url, "http://stub").pathname.replace(/^(\/api\/v1\/trade\/invoices)\/(?!preview$)[^/]+$/u, "$1/:id");
      log.push(`${req.method} ${path} ${result.status}${result.body.fieldErrors ? " " + result.body.fieldErrors[0].messageKey + " " + result.body.fieldErrors[0].path : ""}`);
      if (req.method === "POST" && path === "/api/v1/trade/settlements" && result.status === 201) postedBodies.push(body.command.items);
    }
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
});
const postedBodies = [];
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const problems = [];
const probe = await fetch(`${address}/ready`);
if (probe.status !== 200) problems.push(`就绪探测失败：${probe.status}`);
console.log(`stub ready ${address} probe=${probe.status} mode=${mode} script=${scriptPath} day=${scriptDay}`);
const run = await new Promise((resolve) => {
  const child = spawn(process.execPath, [scriptPath, address, scriptDay]);
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => {
    out += d;
    process.stdout.write(d);
  });
  child.stderr.on("data", (d) => (err += d));
  child.on("close", (status) => resolve({ status, out, err }));
});
server.close();
const tally = new Map();
for (const entry of log) tally.set(entry, (tally.get(entry) ?? 0) + 1);
console.log(`request log: ${log.length} 条；去重计数：`);
for (const [entry, n] of tally) console.log(`  ${n} × ${entry}`);
console.log("末 8 条：\n" + log.slice(-8).map((entry, i) => `  ${log.length - 8 + i + 1}. ${entry}`).join("\n"));
console.log(`script exit ${run.status}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const listGet = "GET /api/v1/trade/invoices 200";
const detailGet = "GET /api/v1/trade/invoices/:id 200";
const ar = [...invoices.values()].find((item) => item.externalNo === "AR-I1-1");
if (mode === "pass") {
  if (run.status !== 0) problems.push(`应退出 0，实际 ${run.status}：${run.err.slice(0, 300)}`);
  const want = new Map([
    ["POST /api/v1/companies 201", 1],
    ["POST /api/v1/trade/orders 201", 1],
    ["POST /api/v1/trade/invoices/preview 200", 106],
    ["POST /api/v1/trade/invoices 201", 106],
    [listGet, 4],
    [detailGet, 2],
    ["POST /api/v1/trade/settlements/preview 200", 1],
    ["POST /api/v1/trade/settlements 201", 1],
  ]);
  if (log.length !== 222 || !same([...tally].sort(), [...want].sort())) problems.push(`请求日志与预期不符（应恰好 222 条）：实际 ${log.length} 条`);
  if (!same(log.slice(0, 2), ["POST /api/v1/companies 201", "POST /api/v1/trade/orders 201"])) problems.push("前两条应是创建公司、创建订单");
  if (!same(log.slice(-8), [listGet, detailGet, "POST /api/v1/trade/settlements/preview 200", "POST /api/v1/trade/settlements 201", detailGet, listGet, listGet, listGet])) problems.push("末 8 条顺序与预期不符");
  if (invoices.size !== 112 || invoices.size !== presetCount + 106) problems.push(`DEFAULT 发票数 ${invoices.size}，应为 112`);
  if (ar?.remaining !== 8560 || ar?.settlements.length !== 1) problems.push(`AR-I1-1 未结 ${ar?.remaining}、核销 ${ar?.settlements.length} 条，应为 8560、1 条`);
  if (!same(postedBodies.map((items) => items.map((item) => [item.gross, item.takeDiscount])), [[[5000, false]]])) problems.push("核销过账内容应是一行 5000、不取折扣：" + JSON.stringify(postedBodies));
  if (invoiced.get("PO-D1/L1") !== 5_000_000) problems.push("PO-D1 应已开满 5");
  if (!companies.has("DEMO2")) problems.push("DEMO2 没有创建");
} else if (mode === "no-ar") {
  if (run.status !== 1) problems.push(`应退出 1，实际 ${run.status}`);
  if (!run.err.includes("AR-I1-1 不存在")) problems.push("错误输出应含 “AR-I1-1 不存在”：" + run.err.slice(0, 300));
  if (log.length !== 215 || log[log.length - 1] !== listGet) problems.push(`日志应恰好 215 条并停在 AR-I1-1 的列表查询：实际 ${log.length} 条，末条 ${log[log.length - 1]}`);
  if (log.some((entry) => entry.includes("settlements"))) problems.push("不应有任何核销请求");
} else if (mode === "overpay") {
  if (run.status !== 1) problems.push(`应退出 1，实际 ${run.status}`);
  if (log[log.length - 1] !== "POST /api/v1/trade/settlements/preview 400 api.error.tradeDocument.quantity items.0") problems.push(`日志应停在核销预览被拒：末条 ${log[log.length - 1]}`);
  if (log.some((entry) => entry === "POST /api/v1/trade/settlements 201") || ar?.remaining !== 13560) problems.push("超额核销不应过账，未结应仍是 13560");
} else {
  if (run.status !== 1) problems.push(`应退出 1，实际 ${run.status}`);
  if (log.length !== 0) problems.push(`day 是当月 1 日时脚本应在任何请求之前失败，实际发了 ${log.length} 条`);
  if (!run.err.includes("readiness: day")) problems.push("错误输出应含 readiness: day：" + run.err.slice(0, 300));
}
if (problems.length > 0) {
  problems.forEach((p) => console.log("PROBLEM:", p));
  process.exit(1);
}
console.log(`stub ${mode} ok`);
