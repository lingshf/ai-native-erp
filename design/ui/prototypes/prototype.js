// UI-1 静态原型：生成外壳（顶栏 + 分组导航），并按 URL 参数或顶栏偏好切换主题、语言、教学模式。
// 用法：page.html?theme=green&lang=en&teaching=0。文案取自 packages/web 现有 labels；data-en 为英文。
(() => {
  const params = new URLSearchParams(location.search);
  const state = {
    theme: params.get("theme") === "green" ? "green" : "red",
    lang: params.get("lang") === "en" ? "en" : "zh",
    teaching: params.get("teaching") !== "0",
  };
  const page = document.body.dataset.page;
  const nav = [
    { items: [["overview", "运行状态", "Runtime status"]] },
    {
      group: ["基础配置", "Master data"],
      items: [
        ["accounts", "科目表", "Chart of accounts"],
        ["dimensions", "财务维度", "Financial dimensions"],
        ["trade", "贸易主数据", "Trade master data"],
      ],
    },
    {
      group: ["总账", "General ledger"],
      items: [
        ["journals", "凭证", "Journals"],
        ["events", "业务事件", "Business events"],
        ["trade-invoices", "采购与销售发票", "Purchase and sales invoices"],
        ["trade-settlements", "付款与收款", "Payments and receipts"],
        ["trade-adjustments", "预付、贷项与专用纠错", "Advances, credits and corrections"],
        ["trade-reports", "往来未结项与账龄", "Trade open items and ageing"],
        ["ledger-reports", "总账报表", "Ledger reports"],
        ["ledger", "总账明细", "General ledger"],
        ["period-close", "期末结账", "Period close"],
      ],
    },
    { group: ["只读报表", "Read-only reports"], items: [["reports", "试算平衡表", "Trial balance"]] },
  ];
  const navHtml = nav
    .map(
      (g) =>
        `<div class="nav-group">${g.group ? `<span data-en="${g.group[1]}">${g.group[0]}</span>` : ""}${g.items
          .map(
            ([id, zh, en]) =>
              `<a href="${id}.html" data-en="${en}"${id === page ? ' aria-current="page"' : ""}>${zh}</a>`,
          )
          .join("")}</div>`,
    )
    .join("");
  const workspace = document.querySelector(".workspace");
  workspace.insertAdjacentHTML(
    "afterbegin",
    `<a class="skip-link" href="#workspace-main" data-en="Skip to main content">跳转到主要内容</a>
    <header class="appbar">
      <span class="brand-mark" aria-hidden="true">ERP</span>
      <h1 data-en="ERP workspace">ERP 工作区</h1>
      <span class="spacer"></span>
      <fieldset class="appbar-prefs">
        <legend data-en="Display preferences">显示偏好</legend>
        <label><span data-en="Language">语言</span>
          <select id="workspace-language"><option value="zh">中文</option><option value="en">English</option></select></label>
        <label><span data-en="Theme">主题</span>
          <select id="workspace-theme"><option value="red" data-en="Professional red">专业红</option><option value="green" data-en="Professional green">专业绿</option></select></label>
        <label><input type="checkbox" id="workspace-teaching" /><span data-en="Show teaching explanations">显示教学说明</span></label>
      </fieldset>
    </header>`,
  );
  const shell = workspace.querySelector(".shell");
  shell.insertAdjacentHTML("afterbegin", `<nav class="nav" aria-label="工作区导航" data-en-label="Workspace navigation">${navHtml}</nav>`);

  for (const el of document.querySelectorAll("[data-en]")) el.dataset.zh = el.innerHTML;
  for (const el of document.querySelectorAll("[data-en-ph]")) el.dataset.zhPh = el.placeholder;
  for (const el of document.querySelectorAll("[data-en-label]")) el.dataset.zhLabel = el.getAttribute("aria-label");

  const render = () => {
    workspace.dataset.theme = state.theme;
    document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
    for (const el of document.querySelectorAll("[data-en]")) {
      el.innerHTML = state.lang === "en" ? el.dataset.en : el.dataset.zh;
    }
    for (const el of document.querySelectorAll("[data-en-ph]")) {
      el.placeholder = state.lang === "en" ? el.dataset.enPh : el.dataset.zhPh;
    }
    for (const el of document.querySelectorAll("[data-en-label]")) {
      el.setAttribute("aria-label", state.lang === "en" ? el.dataset.enLabel : el.dataset.zhLabel);
    }
    for (const el of document.querySelectorAll(".teaching-tip")) el.hidden = !state.teaching;
    document.getElementById("workspace-language").value = state.lang;
    document.getElementById("workspace-theme").value = state.theme;
    document.getElementById("workspace-teaching").checked = state.teaching;
  };
  document.getElementById("workspace-language").addEventListener("change", (e) => {
    state.lang = e.target.value;
    render();
  });
  document.getElementById("workspace-theme").addEventListener("change", (e) => {
    state.theme = e.target.value;
    render();
  });
  document.getElementById("workspace-teaching").addEventListener("change", (e) => {
    state.teaching = e.target.checked;
    render();
  });
  for (const toggle of document.querySelectorAll(".fasttab .toggle")) {
    toggle.addEventListener("click", () => {
      const body = document.getElementById(toggle.getAttribute("aria-controls"));
      const open = toggle.getAttribute("aria-expanded") !== "false";
      toggle.setAttribute("aria-expanded", String(!open));
      body.hidden = open;
    });
  }
  for (const group of document.querySelectorAll(".segmented")) {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === btn));
    });
  }
  render();
  const current = document.querySelector(".nav a[aria-current]");
  if (current && matchMedia("(max-width: 760px)").matches) {
    current.parentElement.parentElement.scrollLeft = current.offsetLeft - 8;
  }
})();
