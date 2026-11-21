// 替身：在本机回环的临时端口上起一个假服务，原样运行 seed-orders.mjs，断言它的请求序列与 AR 分支的商品合约。
// 不启动浏览器，不连真实账套。假服务按产品规则拒绝“销售单用了没有收入科目的商品”，这正是首次真实运行失败的原因。
// 用法：node docs/demo/v0.7.0/scripts/seed-orders-stub.mjs
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const year = String(new Date().getFullYear());
const products = new Map([["EXPENSE", { expenseAccount: "5000", revenueAccount: null }]]);
const seen = [];
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const send = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    seen.push(`${req.method} ${req.url}`);
    if (req.method === "POST" && req.url === "/api/v1/trade/tradeProduct") {
      const d = body.data;
      if (d.type === "service" !== (d.revenueAccount !== null) || d.type === "expense" !== (d.expenseAccount !== null)) return send(400, { code: "SHAPE" });
      products.set(body.code, d);
      return send(201, {});
    }
    if (req.method === "POST" && req.url === "/api/v1/trade/orders") {
      const product = products.get(body.lines[0].product);
      const account = body.side === "AP" ? product?.expenseAccount : product?.revenueAccount;
      if (!account) return send(400, { fieldErrors: [{ path: "lines.0.product", messageKey: "api.error.tradeDocument.product" }] });
      if (!body.orderDate.startsWith(year)) return send(400, { code: "DATE" });
      return send(201, {});
    }
    send(404, {});
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const here = dirname(fileURLToPath(import.meta.url));
const run = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, "seed-orders.mjs"), ...args]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stderr }));
  });
const problems = [];
const ok = await run([address, year]);
if (ok.status !== 0) problems.push(`正常运行应退出 0，实际 ${ok.status}：${ok.stderr.slice(0, 300)}`);
const expected = ["POST /api/v1/trade/tradeProduct", ...Array(4).fill("POST /api/v1/trade/orders")];
if (JSON.stringify(seen) !== JSON.stringify(expected)) problems.push(`请求序列不符：${JSON.stringify(seen)}`);
if (!(products.get("SERVICE")?.revenueAccount === "4000")) problems.push("SERVICE 商品没有收入科目 4000");
const bad = await run([address]);
if (bad.status === 0) problems.push("缺少财年参数时应失败");
server.close();
if (problems.length) {
  problems.forEach((p) => console.log("PROBLEM:", p));
  process.exit(1);
}
console.log("seed-orders stub ok: product first, then 4 orders (2 AP, 2 AR); AR orders use a product with revenue account; missing year fails");
