import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows themed tooltip content after a hover delay and hides it on leave", async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="/mock-workspace/docs/Alpha.md">
        <button type="button">Alpha.md</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Alpha.md" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-describedby");

    fireEvent.pointerEnter(trigger);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("/mock-workspace/docs/Alpha.md");
    expect(tooltip).toHaveClass("bg-(--bg-primary)");
    expect(tooltip).toHaveClass("text-(--text-heading)");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.pointerLeave(trigger);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-describedby");
  });

  it("cancels the hover delay when the pointer leaves early", async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Full path">
        <button type="button">Alpha.md</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Alpha.md" });

    fireEvent.pointerEnter(trigger);
    fireEvent.pointerLeave(trigger);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens for keyboard focus and closes with Escape", () => {
    render(
      <Tooltip content="Full path">
        <button type="button">Alpha.md</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Alpha.md" });

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Full path");

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on keyboard activation", () => {
    render(
      <Tooltip content="Full path">
        <button type="button">Alpha.md</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Alpha.md" });

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Full path");

    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Full path");

    fireEvent.keyDown(trigger, { key: " " });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not open from pointer-initiated focus", () => {
    render(
      <Tooltip content="Full path">
        <button type="button">Alpha.md</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Alpha.md" });

    fireEvent.pointerDown(trigger, { pointerType: "mouse" });
    fireEvent.focus(trigger);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.pointerUp(trigger, { pointerType: "mouse" });
  });

  it("does not open from touch hover events", async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Full path">
        <button type="button">Alpha.md</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Alpha.md" });

    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes when the trigger is pressed", async () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Full path">
        <button type="button">Alpha.md</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Alpha.md" });

    fireEvent.pointerEnter(trigger);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Full path");

    fireEvent.pointerDown(trigger, { pointerType: "mouse" });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
