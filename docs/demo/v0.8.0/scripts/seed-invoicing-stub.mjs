// 替身（PROC-04 要求 11）：在回环临时端口起一个带状态的假服务，按顺序原样运行“被测脚本路径”（seed-trade.mjs、seed-invoicing.mjs 或它们的改动副本），
// 按产品规则校验请求，并断言请求日志。主数据引用与订单 / 发票规则都由替身执行，所以前置主数据缺失会被拒。
// 用法：node seed-invoicing-stub.mjs <模式> <脚本路径> [<脚本路径> ...]    （按顺序运行，遇到非零退出就停止）
//   pass          脚本序列 seed-trade、seed-invoicing：都退出 0，请求日志恰好 20 条（seed-trade 12 条 + seed-invoicing 8 条），
//                 PO-I1 L1=4 L2=未开、PO-I2 L1=10。
//   over-quantity seed-trade 加“PO-I1 开票数量改为 11”的副本：最后一个脚本退出 1，日志为 seed-trade 12 条 + 2 张订单 + 1 次预览 400
//                 api.error.tradeDocument.quantity（lines.0.quantity），之后没有请求。
//   no-master     只运行 seed-invoicing（没有前置主数据）：退出 1，日志恰好 1 条：订单被拒 api.error.tradeDocument.reference（路径 party）。
//   no-taxcode    “去掉税码”的 seed-trade 副本：退出 1，日志恰好 5 条，伙伴创建被拒 api.error.trade.reference（路径 data.allowedTaxCodes）。
//   参数不对、模式未知时退出 2（不算通过）。
// 规则来源（产品代码，以代码为准；替身不模拟科目与期间，科目由 prepare.mjs 在账套里准备，由无浏览器真实服务演练覆盖）：
//   主数据引用：packages/core/src/application/trade-master.ts:90-135（伙伴与商品的 allowedTaxCodes 必须是有效税码；伙伴的 terms、apProfile、arProfile 必须存在且方向匹配；错误 scope trade，规则 reference）
//   订单与发票的伙伴与商品：packages/core/src/application/trade-documents.ts:605-620（伙伴、档案、条款必须存在，规则 reference）与 :638-645（商品必须存在，AP 用费用类商品，规则 reference / product）
//   发票关联订单：同文件 :873-886（订单存在、记账日期不早于订单日期、方向 / 伙伴 / 币种一致）与 :896-899（订单行存在且商品一致）
//   数量不得超过订单剩余：packages/core/src/domain/trade-documents.ts:784-796（matchTradeOrderLine，规则名 quantity）
//   过账须带预览指纹与确认词 POST：packages/infra/src/http/trade-documents.ts:175-190
//   已开票数量接口：packages/infra/src/http/trade-documents.ts:164-173，未开票的行返回 "0"
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const [mode, ...scripts] = process.argv.slice(2);
const modes = ["pass", "over-quantity", "no-master", "no-taxcode"];
if (!modes.includes(mode ?? "") || scripts.length === 0) {
  console.error("usage: seed-invoicing-stub.mjs <pass|over-quantity|no-master|no-taxcode> <script path> [<script path> ...]");
  process.exit(2);
}
const day = new Date().toISOString().slice(0, 10);
const masters = new Map();
const orders = new Map();
const invoiced = new Map();
const previews = new Map();
const log = [];
const micros = (text) => Math.round(Number(text) * 1_000_000);
const rejectIn = (scope, path, rule) => ({ status: 400, body: { fieldErrors: [{ path, messageKey: `api.error.${scope}.${rule}` }] } });
const reject = (path, rule) => rejectIn("tradeDocument", path, rule);
const master = (kind, code) => masters.get(`${kind}/${code}`);
const activeTax = (code, data) => {
  const found = master("taxCode", code);
  return found && found.active && found.data.from <= data.from && found.data.to >= data.to;
};
const masterKinds = ["tradeTerms", "taxCode", "tradeProfile", "tradeParty", "tradeProduct"];

function saveMaster(kind, body) {
  const { data } = body;
  const bad = (path) => rejectIn("trade", `data.${path}`, "reference");
  if (body.kind !== kind || body.expectedRevision !== 0) return { status: 400, body: {} };
  if (master(kind, body.code)) return { status: 409, body: {} };
  if (kind === "tradeParty" || kind === "tradeProduct")
    for (const code of data.allowedTaxCodes) if (!activeTax(code, data)) return bad("allowedTaxCodes");
  if (kind === "tradeParty") {
    if (!master("tradeTerms", data.terms)) return bad("terms");
    for (const [code, side, path] of [[data.apProfile, "AP", "apProfile"], [data.arProfile, "AR", "arProfile"]])
      if (code !== null && master("tradeProfile", code)?.data.side !== side) return bad(path);
  }
  masters.set(`${kind}/${body.code}`, body);
  return { status: 201, body: {} };
}

// 伙伴、商品必须已由主数据建立（trade-documents.ts:605-645）
function checkReferences(command) {
  const party = master("tradeParty", command.party);
  if (!party) return reject("party", "reference");
  const profileCode = command.side === "AP" ? party.data.apProfile : party.data.arProfile;
  if (profileCode === null) return reject("party", "party");
  for (const [index, line] of command.lines.entries()) {
    const product = master("tradeProduct", line.product);
    if (!product) return reject(`lines.${index}.product`, "reference");
    const account = command.side === "AP" ? product.data.expenseAccount : product.data.revenueAccount;
    if (product.data.type !== (command.side === "AP" ? "expense" : "service") || account === null) return reject(`lines.${index}.product`, "product");
  }
  return null;
}

function handle(method, url, body) {
  const path = new URL(url, "http://stub").pathname;
  if (method === "PUT" && path === "/api/v1/periods") return { status: 200, body: {} };
  const kind = /^\/api\/v1\/trade\/(\w+)$/u.exec(path)?.[1];
  if (method === "POST" && kind && masterKinds.includes(kind)) return saveMaster(kind, body);
  if (method === "POST" && path === "/api/v1/trade/orders") {
    const failed = checkReferences(body);
    if (failed) return failed;
    if (orders.has(body.orderId)) return { status: 409, body: {} };
    orders.set(body.orderId, body);
    return { status: 201, body: {} };
  }
  if (method === "POST" && (path === "/api/v1/trade/invoices/preview" || path === "/api/v1/trade/invoices")) {
    const posting = path === "/api/v1/trade/invoices";
    if (posting && (body.confirmation !== "POST" || !body.idempotencyKey)) return reject("confirmation", "shape");
    const command = posting ? body.command : body;
    const failed = checkReferences(command);
    if (failed) return failed;
    const order = command.orderId === null ? null : orders.get(command.orderId);
    if (command.orderId !== null) {
      if (!order) return reject("orderId", "order");
      if (command.accountingDate < order.orderDate) return reject("accountingDate", "reference");
      if (command.side !== order.side || command.party !== order.party || command.currency !== order.currency) return reject("orderId", "order");
      for (const [index, line] of command.lines.entries()) {
        const orderLine = order.lines.find((item) => item.lineId === line.orderLineId);
        if (!orderLine || orderLine.product !== line.product) return reject(`lines.${index}.orderLineId`, "orderLine");
        const done = invoiced.get(`${command.orderId}/${line.orderLineId}`) ?? 0;
        if (done + micros(line.quantity) > micros(orderLine.quantity)) return reject(`lines.${index}.quantity`, "quantity");
      }
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    if (!posting) {
      previews.set(fingerprint, command);
      return { status: 200, body: { fingerprint, calculation: { gross: 1 } } };
    }
    if (body.fingerprint !== fingerprint || !previews.has(fingerprint)) return reject("fingerprint", "stale");
    if (order)
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
console.log(`stub ready ${address} probe=${probe.status} mode=${mode} scripts=${scripts.join(" , ")}`);
const statuses = [];
let stderr = "";
for (const scriptPath of scripts) {
  const run = await new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, address, day]);
    let err = "";
    child.stdout.on("data", (d) => process.stdout.write(d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (status) => resolve({ status, err }));
  });
  statuses.push(run.status);
  stderr = run.err;
  if (run.status !== 0) break;
}
server.close();
console.log("request log:\n" + log.map((entry, i) => `  ${i + 1}. ${entry}`).join("\n"));
console.log(`script exits ${statuses.join(",")}`);
const sameLog = (want) => JSON.stringify(log) === JSON.stringify(want);
const tradeLog = [
  "PUT /api/v1/periods 200",
  "POST /api/v1/trade/tradeTerms 201",
  "POST /api/v1/trade/taxCode 201",
  "POST /api/v1/trade/tradeProfile 201",
  "POST /api/v1/trade/tradeProfile 201",
  "POST /api/v1/trade/tradeParty 201",
  "POST /api/v1/trade/tradeParty 201",
  "POST /api/v1/trade/tradeProduct 201",
  "POST /api/v1/trade/invoices/preview 200",
  "POST /api/v1/trade/invoices 201",
  "POST /api/v1/trade/invoices/preview 200",
  "POST /api/v1/trade/invoices 201",
];
const orderPosts = ["POST /api/v1/trade/orders 201", "POST /api/v1/trade/orders 201"];
const last = statuses[statuses.length - 1];
const expectExit = (code, count) => {
  if (last !== code) problems.push(`最后一个脚本应退出 ${code}，实际 ${last}：${stderr.slice(0, 300)}`);
  if (statuses.length !== count) problems.push(`应运行 ${count} 个脚本，实际 ${statuses.length}`);
};
if (mode === "pass") {
  expectExit(0, 2);
  const want = [
    ...tradeLog,
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
} else if (mode === "over-quantity") {
  expectExit(1, 2);
  if (!sameLog([...tradeLog, ...orderPosts, "POST /api/v1/trade/invoices/preview 400 api.error.tradeDocument.quantity lines.0.quantity"])) problems.push("请求日志与预期不符（应恰好停在 PO-I1 预览被拒）");
  if (!stderr.includes("400")) problems.push("脚本错误输出里没有 400");
} else if (mode === "no-master") {
  expectExit(1, 1);
  if (!sameLog(["POST /api/v1/trade/orders 400 api.error.tradeDocument.reference party"])) problems.push("请求日志与预期不符（订单应因伙伴不存在被拒，且之后没有请求）");
} else {
  expectExit(1, 1);
  const want = [
    "PUT /api/v1/periods 200",
    "POST /api/v1/trade/tradeTerms 201",
    "POST /api/v1/trade/tradeProfile 201",
    "POST /api/v1/trade/tradeProfile 201",
    "POST /api/v1/trade/tradeParty 400 api.error.trade.reference data.allowedTaxCodes",
  ];
  if (!sameLog(want)) problems.push("请求日志与预期不符（伙伴应因税码不存在被拒，且之后没有请求）");
}
if (problems.length > 0) {
  problems.forEach((p) => console.log("PROBLEM:", p));
  process.exit(1);
}
console.log(`stub ${mode} ok`);
