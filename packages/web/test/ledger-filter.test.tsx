import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { label, type Language } from "../src/ui/index.ts";
import { App } from "../src/App.tsx";

const company = {
  code: "DEFAULT",
  name: "Synthetic",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual" as const,
  revision: 1,
};
const snapshot =
  "company=DEFAULT&month=2026-01&stage=unadjusted&account=1000&watermark=1&accountRevision=1";
const ledgerPage = {
  company: "DEFAULT",
  month: "2026-01",
  account: "1000",
  currency: "CNY",
  scale: 2,
  stage: "unadjusted",
  opening: 0,
  debit: 0,
  credit: 0,
  closing: 0,
  total: 0,
  watermark: 1,
  accountRevision: 1,
  items: [],
  nextCursor: null,
};
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function installFetch() {
  const ledgerRequests: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return reply({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [{ month: "2026-01", status: "open", revision: 1 }],
          nextCursor: null,
        });
      if (url.pathname === "/api/v1/ledger") {
        ledgerRequests.push(url.searchParams);
        return reply(ledgerPage);
      }
      return reply({
        service: "ai-native-erp",
        contractVersion: "1",
        profile: "local",
        data: "unconfigured",
      });
    }),
  );
  return ledgerRequests;
}

async function openLedger(query: string) {
  window.history.replaceState(null, "", `/#/ledger?${query}`);
  render(<App />);
  await screen.findByRole("button", { name: label("zh", "ledger.apply") });
}

function field(language: Language, key: "ledger.dimension" | "ledger.value") {
  return screen.getByLabelText(label(language, key)) as HTMLInputElement;
}

function hashParams() {
  return new URLSearchParams(window.location.hash.split("?")[1]);
}

function submitFilters() {
  fireEvent.click(screen.getByRole("button", { name: label("zh", "ledger.apply") }));
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BUG-01 ledger filter value requires a dimension", () => {
  it("disables the value input until a dimension is entered, in Chinese and English", async () => {
    installFetch();
    await openLedger(snapshot);
    expect(field("zh", "ledger.value").disabled).toBe(true);
    fireEvent.change(field("zh", "ledger.dimension"), { target: { value: "DEPT" } });
    expect(field("zh", "ledger.value").disabled).toBe(false);
    fireEvent.change(field("zh", "ledger.dimension"), { target: { value: "" } });
    const language = document.querySelector("#workspace-language");
    if (!language) throw new Error("Missing workspace language selector");
    fireEvent.change(language, { target: { value: "en" } });
    expect(field("en", "ledger.value").disabled).toBe(true);
  });

  it("clears the value when the dimension is cleared and submits no orphan value", async () => {
    installFetch();
    await openLedger(snapshot);
    fireEvent.change(field("zh", "ledger.dimension"), { target: { value: "DEPT" } });
    fireEvent.change(field("zh", "ledger.value"), { target: { value: "7" } });
    fireEvent.change(field("zh", "ledger.dimension"), { target: { value: "" } });
    submitFilters();
    await waitFor(() => expect(hashParams().get("account")).toBe("1000"));
    expect(hashParams().has("value")).toBe(false);
    expect(hashParams().has("dimension")).toBe(false);
    expect(screen.queryByText(label("zh", "ledger.invalid"), { exact: false })).toBeNull();
    expect(field("zh", "ledger.value").value).toBe("");
    expect(field("zh", "ledger.value").disabled).toBe(true);
  });

  it("still submits a dimension together with its value", async () => {
    const ledgerRequests = installFetch();
    await openLedger(snapshot);
    fireEvent.change(field("zh", "ledger.dimension"), { target: { value: "DEPT" } });
    fireEvent.change(field("zh", "ledger.value"), { target: { value: "7" } });
    submitFilters();
    await waitFor(() => expect(hashParams().get("dimension")).toBe("DEPT"));
    expect(hashParams().get("value")).toBe("7");
    await waitFor(() => expect(ledgerRequests.at(-1)?.get("value")).toBe("7"));
  });

  it("keeps showing the invalid notice for a hand-written URL with an orphan value", async () => {
    const ledgerRequests = installFetch();
    window.history.replaceState(null, "", `/#/ledger?${snapshot}&value=7`);
    render(<App />);
    expect(await screen.findByText(label("zh", "ledger.invalid"), { exact: false })).toBeTruthy();
    expect(hashParams().get("value")).toBe("7");
    expect(ledgerRequests).toEqual([]);
  });
});
