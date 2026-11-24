
// TEMPORARY (DEMO-22 focus-path check, not committed): the next Tab stop after a fixed start, in DOM order.
describe("DEMO-22 focus path", () => {
  const mountEn = (language: "zh" | "en" = "en") => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TradeSettlements preferences={{ language, theme: "green", teaching: true }} />
      </QueryClientProvider>,
    );
  };
  const tabbable = () =>
    [...document.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],[tabindex]")].filter(
      (n) => !n.matches(":disabled") && n.tabIndex >= 0 && !n.closest("[hidden]"),
    );
  const nextTab = (start: HTMLElement) => tabbable()[tabbable().indexOf(start) + 1];
  const toggle = () => document.querySelector<HTMLElement>('[aria-controls="tset-allocation-body"]') as HTMLElement;
  it("K1/K2: from the Allocation tab header, Tab reaches Refresh list (also with a selection)", async () => {
    mockApi(false);
    mountEn();
    await screen.findByText("INV-1");
    expect(toggle().textContent).toContain(label("en", "tset.allocation"));
    expect(nextTab(toggle()).textContent).toBe(label("en", "master.listRefresh"));
    fireEvent.click(screen.getByLabelText(`${label("en", "tset.select")} INV-1`));
    expect(nextTab(toggle()).textContent).toBe(label("en", "master.listRefresh"));
  });
  it("K3: with a confirmation pending the table is locked but Tab still reaches Refresh list", async () => {
    mockApi(true);
    mountEn("zh");
    await screen.findByText("INV-1");
    await selectPartial();
    fireEvent.click(screen.getByRole("button", { name: label("zh", "tinv.preview") }));
    await waitFor(() => expect(disabled(label("zh", "tset.confirm"))).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: label("zh", "tset.confirm") }));
    await screen.findByRole("button", { name: label("zh", "tinv.retryConfirm") });
    expect(screen.getByLabelText(`${label("zh", "tset.select")} INV-1`).matches(":disabled")).toBe(true);
    expect(nextTab(toggle()).textContent).toBe(label("zh", "master.listRefresh"));
  });
});
