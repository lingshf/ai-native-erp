// 替身（PROC-04 要求 11）：在回环临时端口起假服务，原样运行“被测脚本路径”，按产品规则校验请求并断言请求日志。
// 用法：node seed-invoicing-stub.mjs <脚本路径> <pass|over-quantity>
//   pass           期望脚本退出 0，请求日志恰好 8 条，两张订单的已开票数量为 PO-I1 L1=4 L2=0、PO-I2 L1=10。
//   over-quantity  期望脚本退出 1：PO-I1 的发票预览被拒（400，api.error.tradeDocument.quantity，路径 lines.0.quantity），
//                  日志恰好 3 条（2 张订单 + 1 次预览），之后的过账与读取都没有发出。
// 规则来源（产品代码，以代码为准）：
//   订单商品须有与方向匹配的科目：packages/core/src/application/trade-documents.ts:638-641（AP 用费用科目，AR 用收入科目）
//   发票关联订单：同文件 :873-886（订单存在、记账日期不早于订单日期、方向 / 伙伴 / 币种一致）与 :896-899（订单行存在且商品一致）
//   数量不得超过订单剩余：packages/core/src/domain/trade-documents.ts:784-796（matchTradeOrderLine，规则名 quantity）
//   过账须带预览指纹与确认词 POST：packages/infra/src/http/trade-documents.ts:175-190 与 confirm 契约
//   已开票数量接口：packages/infra/src/http/trade-documents.ts:164-173，未开票的行返回 "0"
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const [scriptPath, mode] = process.argv.slice(2);
if (!scriptPath || !["pass", "over-quantity"].includes(mode ?? "")) {
  console.error("usage: seed-invoicing-stub.mjs <script path> <pass|over-quantity>");
  process.exit(2);
}
const day = new Date().toISOString().slice(0, 10);
const orders = new Map();
const invoiced = new Map();
const previews = new Map();
const log = [];
const micros = (text) => Math.round(Number(text) * 1_000_000);
const reject = (path, rule) => ({ status: 400, body: { fieldErrors: [{ path, messageKey: `api.error.tradeDocument.${rule}` }] } });

function handle(method, url, body) {
  const path = new URL(url, "http://stub").pathname;
  if (method === "POST" && path === "/api/v1/trade/orders") {
    for (const [index, line] of body.lines.entries())
      if (body.side !== "AP" || line.product !== "EXPENSE") return reject(`lines.${index}.product`, "product");
    if (orders.has(body.orderId)) return { status: 409, body: {} };
    orders.set(body.orderId, body);
    return { status: 201, body: {} };
  }
  if (method === "POST" && (path === "/api/v1/trade/invoices/preview" || path === "/api/v1/trade/invoices")) {
    const posting = path === "/api/v1/trade/invoices";
    if (posting && (body.confirmation !== "POST" || !body.idempotencyKey)) return reject("confirmation", "shape");
    const command = posting ? body.command : body;
    const order = orders.get(command.orderId);
    if (!order) return reject("orderId", "order");
    if (command.accountingDate < order.orderDate) return reject("accountingDate", "reference");
    if (command.side !== order.side || command.party !== order.party || command.currency !== order.currency) return reject("orderId", "order");
    for (const [index, line] of command.lines.entries()) {
      const orderLine = order.lines.find((item) => item.lineId === line.orderLineId);
      if (!orderLine || orderLine.product !== line.product) return reject(`lines.${index}.orderLineId`, "orderLine");
      const done = invoiced.get(`${command.orderId}/${line.orderLineId}`) ?? 0;
      if (done + micros(line.quantity) > micros(orderLine.quantity)) return reject(`lines.${index}.quantity`, "quantity");
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    if (!posting) {
      previews.set(fingerprint, command);
      return { status: 200, body: { fingerprint, calculation: { gross: 1 } } };
    }
    if (body.fingerprint !== fingerprint || !previews.has(fingerprint)) return reject("fingerprint", "stale");
    for (const line of command.lines) {
      const key = `${command.orderId}/${line.orderLineId}`;
      invoiced.set(key, (invoiced.get(key) ?? 0) + micros(line.quantity));
    }
    return { status: 201, body: {} };
  }
  const match = /^\/api\/v1\/trade\/orders\/([^/]+)\/invoicing$/u.exec(path);
  if (method === "GET" && match) {
    const order = orders.get(match[1]);
    if (!order) return { status: 404, body: { code: "NOT_FOUND" } };
    return { status: 200, body: { order, invoiced: order.lines.map((line) => ({ lineId: line.lineId, invoicedQuantity: String((invoiced.get(`${order.orderId}/${line.lineId}`) ?? 0) / 1_000_000) })) } };
  }
  if (method === "GET" && path === "/ready") return { status: 200, body: {} };
  return { status: 404, body: {} };
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const result = handle(req.method, req.url, body);
    if (req.url !== "/ready") log.push(`${req.method} ${new URL(req.url, "http://stub").pathname} ${result.status}${result.body.fieldErrors ? " " + result.body.fieldErrors[0].messageKey + " " + result.body.fieldErrors[0].path : ""}`);
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const problems = [];
const probe = await fetch(`${address}/ready`);
if (probe.status !== 200) problems.push(`就绪探测失败：${probe.status}`);
console.log(`stub ready ${address} probe=${probe.status} script=${scriptPath} mode=${mode}`);
const run = await new Promise((resolve) => {
  const child = spawn(process.execPath, [scriptPath, address, day]);
  let stderr = "";
  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => (stderr += d));
  child.on("close", (status) => resolve({ status, stderr }));
});
server.close();
console.log("request log:\n" + log.map((entry, i) => `  ${i + 1}. ${entry}`).join("\n"));
console.log(`script exit ${run.status}`);
const sameLog = (want) => JSON.stringify(log) === JSON.stringify(want);
const orderPosts = ["POST /api/v1/trade/orders 201", "POST /api/v1/trade/orders 201"];
if (mode === "pass") {
  if (run.status !== 0) problems.push(`应退出 0，实际 ${run.status}：${run.stderr.slice(0, 300)}`);
  const want = [
    ...orderPosts,
    "POST /api/v1/trade/invoices/preview 200",
    "POST /api/v1/trade/invoices 201",
    "POST /api/v1/trade/invoices/preview 200",
    "POST /api/v1/trade/invoices 201",
    "GET /api/v1/trade/orders/PO-I1/invoicing 200",
    "GET /api/v1/trade/orders/PO-I2/invoicing 200",
  ];
  if (!sameLog(want)) problems.push("请求日志与预期不符");
  if (invoiced.get("PO-I1/L1") !== 4_000_000 || invoiced.get("PO-I1/L2") !== undefined || invoiced.get("PO-I2/L1") !== 10_000_000) problems.push("已开票数量与预期不符");
} else {
  if (run.status !== 1) problems.push(`应退出 1，实际 ${run.status}`);
  const want = [...orderPosts, "POST /api/v1/trade/invoices/preview 400 api.error.tradeDocument.quantity lines.0.quantity"];
  if (!sameLog(want)) problems.push("请求日志与预期不符（应恰好停在 PO-I1 预览被拒）");
  if (!run.stderr.includes("400")) problems.push("脚本错误输出里没有 400");
}
if (problems.length > 0) {
  problems.forEach((p) => console.log("PROBLEM:", p));
  process.exit(1);
}
console.log(`stub ${mode} ok`);
