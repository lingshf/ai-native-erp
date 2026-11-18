import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { label, preferenceStorageKey } from "../src/ui/index.ts";
import { App } from "../src/App.tsx";

const healthy = {
  service: "ai-native-erp",
  contractVersion: "1",
  profile: "local",
  data: "unconfigured",
} as const;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function languageSelect(): HTMLSelectElement {
  return document.querySelector<HTMLSelectElement>("#workspace-language")!;
}

function themeSelect(): HTMLSelectElement {
  return document.querySelector<HTMLSelectElement>("#workspace-theme")!;
}

function teachingCheckbox(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#workspace-teaching")!;
}

describe("M01 read-only health shell", () => {
  it("loads the real relative endpoint, validates health, and keeps the unconfigured warning visible", async () => {
    const fetchMock = mockFetch().mockResolvedValue(response(healthy));
    render(<App />);
    expect(screen.getByText(label("zh", "shell.healthLoading"))).toBeTruthy();
    expect(screen.getByText(label("zh", "shell.dataWarning"))).toBeTruthy();
    expect(await screen.findByText(label("zh", "shell.connected"))).toBeTruthy();
    expect(screen.getByText(healthy.service)).toBeTruthy();
    expect(screen.getByText(label("zh", "shell.unconfigured"))).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", { signal: expect.any(AbortSignal) });
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.title).toBe(label("zh", "shell.documentTitle"));
    expect(document.documentElement.lang).toBe("zh");
  });

  it.each([
    ["extra field", { ...healthy, path: "private-path" }],
    ["wrong service", { ...healthy, service: "other-service" }],
    ["wrong contract", { ...healthy, contractVersion: "2" }],
    ["wrong profile", { ...healthy, profile: "server" }],
    ["unknown data state", { ...healthy, data: "unknown" }],
    ["missing field", { service: healthy.service, profile: "local", data: "unconfigured" }],
    ["null", null],
  ])("rejects malformed health: %s", async (_name, body) => {
    mockFetch().mockResolvedValue(response(body));
    render(<App />);
    expect(await screen.findByText(label("zh", "shell.invalidResponse"))).toBeTruthy();
    expect(screen.queryByText(label("zh", "shell.connected"))).toBeNull();
    expect(screen.queryByText("private-path")).toBeNull();
    expect(screen.getByRole("button", { name: label("zh", "shell.retry") })).toBeTruthy();
  });

  it("shows a real network error until explicit retry succeeds, with no background polling", async () => {
    const fetchMock = mockFetch()
      .mockRejectedValueOnce(new Error("private-path in transport"))
      .mockResolvedValueOnce(response(healthy));
    render(<App />);
    expect(await screen.findByText(label("zh", "shell.networkError"))).toBeTruthy();
    expect(screen.queryByText(label("zh", "shell.connected"))).toBeNull();
    expect(document.body.textContent).not.toContain("private-path");
    fireEvent.change(languageSelect(), { target: { value: "en" } });
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    expect(screen.getByText(label("en", "shell.networkError"))).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: label("en", "shell.retry") }));
    expect(await screen.findByText(label("en", "shell.connected"))).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a raw server error without exposing body or parsing errors", async () => {
    mockFetch().mockResolvedValue(
      response({ message: "private-path", stack: "private-stack" }, 500),
    );
    render(<App />);
    expect(await screen.findByText(label("zh", "shell.invalidResponse"))).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/private-path|private-stack/);
    expect(screen.queryByText(label("zh", "shell.connected"))).toBeNull();
  });

  it("handles invalid JSON visibly rather than rendering success", async () => {
    mockFetch().mockResolvedValue(new Response("<html>private-path</html>", { status: 503 }));
    render(<App />);
    expect(await screen.findByText(label("zh", "shell.invalidResponse"))).toBeTruthy();
    expect(document.body.textContent).not.toContain("private-path");
  });

  it("aborts on unmount and ignores a late response even when transport ignores abort", async () => {
    const late = pending<Response>();
    const fetchMock = mockFetch()
      .mockReturnValueOnce(late.promise)
      .mockResolvedValueOnce(response({ ...healthy, data: "unknown" }));
    const old = render(<App />);
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    old.unmount();
    expect(signal?.aborted).toBe(true);
    render(<App />);
    expect(await screen.findByText(label("zh", "shell.invalidResponse"))).toBeTruthy();
    await act(async () => {
      late.resolve(response(healthy));
      await late.promise;
    });
    expect(screen.queryByText(label("zh", "shell.connected"))).toBeNull();
    expect(screen.getByText(label("zh", "shell.invalidResponse"))).toBeTruthy();
  });

  it("also ignores a body that finishes decoding after cleanup", async () => {
    const body = pending<unknown>();
    const json = vi.fn().mockReturnValue(body.promise);
    mockFetch().mockResolvedValue({ ok: true, status: 200, json } as unknown as Response);
    const mounted = render(<App />);
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    mounted.unmount();
    await act(async () => {
      body.resolve(healthy);
      await body.promise;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("M01 preferences and state protection", () => {
  it("defaults to zh/red/teaching-off, preserves focused controls and pending request across every preference change", async () => {
    const request = pending<Response>();
    const fetchMock = mockFetch().mockReturnValue(request.promise);
    render(<App />);
    const language = languageSelect();
    const theme = themeSelect();
    const teaching = teachingCheckbox();
    const status = screen.getByRole("status");
    expect(language.value).toBe("zh");
    expect(theme.value).toBe("red");
    expect(teaching.checked).toBe(false);
    expect(screen.queryByText(label("zh", "shell.teachingNote"))).toBeNull();
    language.focus();
    fireEvent.change(language, { target: { value: "en" } });
    expect(document.activeElement).toBe(language);
    fireEvent.change(theme, { target: { value: "green" } });
    fireEvent.click(teaching);
    expect(languageSelect()).toBe(language);
    expect(themeSelect()).toBe(theme);
    expect(teachingCheckbox()).toBe(teaching);
    expect(screen.getByRole("status")).toBe(status);
    expect(screen.getByText(label("en", "shell.healthLoading"))).toBeTruthy();
    expect(screen.getByText(label("en", "shell.teachingNote"))).toBeTruthy();
    expect(screen.getByText(label("en", "shell.dataWarning"))).toBeTruthy();
    expect(document.querySelector(".workspace")?.getAttribute("data-theme")).toBe("green");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe(label("en", "shell.documentTitle"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(preferenceStorageKey)!)).toEqual({
      language: "en",
      theme: "green",
      teaching: true,
    });
    await act(async () => {
      request.resolve(response(healthy));
      await request.promise;
    });
    expect(await screen.findByText(label("en", "shell.connected"))).toBeTruthy();
    fireEvent.click(teaching);
    fireEvent.change(theme, { target: { value: "red" } });
    fireEvent.change(language, { target: { value: "zh" } });
    expect(screen.queryByText(label("zh", "shell.teachingNote"))).toBeNull();
    expect(screen.getByText(label("zh", "shell.dataWarning"))).toBeTruthy();
    expect(screen.getByText(label("zh", "shell.connected"))).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(preferenceStorageKey)!)).toEqual({
      language: "zh",
      theme: "red",
      teaching: false,
    });
  });

  it("restores all saved preferences after remount", async () => {
    mockFetch().mockResolvedValue(response(healthy));
    window.localStorage.setItem(
      preferenceStorageKey,
      JSON.stringify({
        language: "en",
        theme: "green",
        teaching: true,
      }),
    );
    render(<App />);
    expect(languageSelect().value).toBe("en");
    expect(themeSelect().value).toBe("green");
    expect(teachingCheckbox().checked).toBe(true);
    expect(screen.getByText(label("en", "shell.teachingNote"))).toBeTruthy();
    expect(await screen.findByText(label("en", "shell.connected"))).toBeTruthy();
  });

  it.each([
    "{broken",
    "null",
    "[]",
    '{"language":"fr","theme":"green","teaching":true}',
    '{"language":"en","theme":"blue","teaching":true}',
    '{"language":"en","theme":"green","teaching":"false"}',
    '{"language":"en","theme":"green"}',
    '{"language":"en","theme":"green","teaching":true,"extra":1}',
  ])("notifies and uses complete defaults for corrupt saved values: %s", async (serialized) => {
    mockFetch().mockResolvedValue(response(healthy));
    window.localStorage.setItem(preferenceStorageKey, serialized);
    render(<App />);
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageCorrupt"));
    expect(languageSelect().value).toBe("zh");
    expect(themeSelect().value).toBe("red");
    expect(teachingCheckbox().checked).toBe(false);
    expect(window.localStorage.getItem(preferenceStorageKey)).toBe(serialized);
    expect(await screen.findByText(label("zh", "shell.connected"))).toBeTruthy();
  });

  it("aggregates read and write failures visibly without changing the last accepted preferences", async () => {
    mockFetch().mockResolvedValue(response(healthy));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private-path");
    });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private-path");
    });
    render(<App />);
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageRead"));
    fireEvent.change(languageSelect(), { target: { value: "en" } });
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    fireEvent.click(teachingCheckbox());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(label("zh", "shell.storageRead"));
    expect(alert.textContent).toContain(label("zh", "shell.storageWrite"));
    expect(alert.querySelectorAll("li")).toHaveLength(2);
    expect(languageSelect().value).toBe("zh");
    expect(themeSelect().value).toBe("red");
    expect(teachingCheckbox().checked).toBe(false);
    expect(document.body.textContent).not.toContain("private-path");
    expect(await screen.findByText(label("zh", "shell.connected"))).toBeTruthy();
    write.mockRestore();
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    expect(themeSelect().value).toBe("green");
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageRead"));
    expect(screen.queryByText(label("zh", "shell.storageWrite"))).toBeNull();
  });

  it("notifies when the localStorage getter is blocked", async () => {
    mockFetch().mockResolvedValue(response(healthy));
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<App />);
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageRead"));
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageWrite"));
    expect(themeSelect().value).toBe("red");
    expect(await screen.findByText(label("zh", "shell.connected"))).toBeTruthy();
  });

  it("retains a previously accepted value on later save failure and can recover by explicit change", async () => {
    mockFetch().mockResolvedValue(response(healthy));
    render(<App />);
    fireEvent.change(languageSelect(), { target: { value: "en" } });
    const before = window.localStorage.getItem(preferenceStorageKey);
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    fireEvent.change(languageSelect(), { target: { value: "zh" } });
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    expect(languageSelect().value).toBe("en");
    expect(themeSelect().value).toBe("red");
    expect(window.localStorage.getItem(preferenceStorageKey)).toBe(before);
    expect(screen.getByRole("alert").textContent).toContain(label("en", "shell.storageWrite"));
    write.mockRestore();
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    expect(themeSelect().value).toBe("green");
    expect(JSON.parse(window.localStorage.getItem(preferenceStorageKey)!)).toEqual({
      language: "en",
      theme: "green",
      teaching: false,
    });
    expect(screen.queryByText(label("en", "shell.storageWrite"))).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(await screen.findByText(label("en", "shell.connected"))).toBeTruthy();
  });

  it("clears a recovered write warning without removing the corrupt-preference notice", async () => {
    mockFetch().mockResolvedValue(response(healthy));
    window.localStorage.setItem(preferenceStorageKey, "{broken");
    render(<App />);
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageCorrupt"));
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageWrite"));
    write.mockRestore();
    fireEvent.change(themeSelect(), { target: { value: "green" } });
    expect(themeSelect().value).toBe("green");
    expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.storageCorrupt"));
    expect(screen.queryByText(label("zh", "shell.storageWrite"))).toBeNull();
    expect(await screen.findByText(label("zh", "shell.connected"))).toBeTruthy();
  });
});
