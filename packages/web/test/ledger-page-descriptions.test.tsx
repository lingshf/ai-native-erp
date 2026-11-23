import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";

type Key = Exclude<LabelKey, "shell.httpError">;
const company = {
  code: "DEFAULT",
  name: "Local",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const pages: {
  route: string;
  title: Key;
  description: Key;
  teaching: Key;
  expected: { zh: string; en: string };
}[] = [
  {
    route: "/#/accounts",
    title: "master.title",
    description: "master.description",
    teaching: "master.teachingTitle",
    expected: {
      zh: "按公司维护会计科目的类别、报表分组、余额方向与手工录入权限。",
      en: "Maintain each company's accounts: category, report group, normal side and manual-entry permission.",
    },
  },
  {
    route: "/#/dimensions",
    title: "dim.title",
    description: "dim.description",
    teaching: "master.teachingTitle",
    expected: {
      zh: "配置维度、维度值、科目维度结构、默认值、派生规则与平衡维度。",
      en: "Configure dimensions, values, account structures, defaults, derivation rules and balancing dimensions.",
    },
  },
  {
    route: "/#/journals",
    title: "journal.title",
    description: "journal.description",
    teaching: "journal.teachingTitle",
    expected: {
      zh: "录入手工凭证草稿，预览并确认过账，再查看或反向已过账凭证。",
      en: "Enter manual journal drafts, preview and confirm posting, then review or reverse posted journals.",
    },
  },
  {
    route: "/#/events",
    title: "business.title",
    description: "business.description",
    teaching: "business.teachingTitle",
    expected: {
      zh: "维护服务、往来方与过账规则，录入业务事件并处理待转队列。",
      en: "Maintain services, parties and posting rules, record business events and process the transfer queue.",
    },
  },
];
const response = (body: unknown) => new Response(JSON.stringify(body));
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      return response({ items: [], nextCursor: null });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

it("keeps every page description within D6 length limits", () => {
  for (const page of pages) {
    expect(Array.from(page.expected.zh).length).toBeLessThanOrEqual(40);
    expect(page.expected.en.length).toBeLessThanOrEqual(120);
  }
});

it.each(pages)(
  "shows the $route page description verbatim in zh and en with teaching off and on",
  async (page) => {
    window.history.replaceState(null, "", page.route);
    const { container } = render(<App />);
    await screen.findByRole("heading", {
      level: 2,
      name: label("zh", page.title),
    });
    const assertHeader = (language: "zh" | "en", teaching: boolean) => {
      const heading = screen.getByRole("heading", {
        level: 2,
        name: label(language, page.title),
      });
      const description = heading.nextElementSibling;
      expect(description?.tagName).toBe("P");
      expect(description?.textContent).toBe(page.expected[language]);
      expect(label(language, page.description)).toBe(page.expected[language]);
      const tip = [...container.querySelectorAll("aside.teaching-tip")].find(
        (element) => element.getAttribute("aria-label") === label(language, page.teaching),
      );
      expect(Boolean(tip)).toBe(teaching);
    };
    const switchTo = (from: "zh" | "en", to: "zh" | "en") =>
      fireEvent.change(screen.getByLabelText(label(from, "shell.language")), {
        target: { value: to },
      });
    for (const teaching of [false, true]) {
      if (teaching)
        fireEvent.click(screen.getByLabelText(label("zh", "shell.showTeachingExplanations")));
      assertHeader("zh", teaching);
      switchTo("zh", "en");
      assertHeader("en", teaching);
      switchTo("en", "zh");
    }
  },
);
