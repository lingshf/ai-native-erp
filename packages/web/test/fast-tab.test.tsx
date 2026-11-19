import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FastTab } from "../src/ui/components/index.tsx";

function Harness({ alert }: { alert: boolean }) {
  const [shown, setShown] = useState(alert);
  return (
    <>
      <button type="button" onClick={() => setShown((value) => !value)}>
        flip
      </button>
      <FastTab id="demo" title="General" summary="1600">
        <p>body</p>
        {shown && <p role="alert">broken</p>}
      </FastTab>
    </>
  );
}

describe("FastTab", () => {
  it("collapses and expands through the h3 toggle when there is no alert", () => {
    render(<Harness alert={false} />);
    const toggle = screen.getByRole("button", { name: "General" });
    expect(toggle.closest("h3")).not.toBeNull();
    expect(toggle.getAttribute("aria-controls")).toBe("demo-body");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("demo-body")?.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(document.getElementById("demo-body")?.hidden).toBe(false);
  });

  it("stays expanded while it contains role=alert, even when the toggle is pressed", () => {
    render(<Harness alert />);
    const toggle = screen.getByRole("button", { name: "General" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("demo-body")?.hidden).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("broken");
  });

  it("re-expands when an alert appears inside a collapsed body", async () => {
    render(<Harness alert={false} />);
    const toggle = screen.getByRole("button", { name: "General" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "flip" }));
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("demo-body")?.hidden).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("broken");
  });
});
