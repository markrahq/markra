import { render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { ThemeCompatibilityNotice } from "./ThemeCompatibilityNotice";

it("shows detected Typora compatibility and actionable limitations", () => {
  render(<ThemeCompatibilityNotice compatibility={{ kind: "typora", warnings: ["resources", "unsupported", "syntax"] }} translate={translate} />);
  expect(screen.getByRole("status")).toHaveTextContent("Typora theme detected");
  expect(screen.getByRole("status")).toHaveTextContent("not loaded");
  expect(screen.getByRole("status")).toHaveTextContent("skipped");
  expect(screen.getByRole("status")).toHaveTextContent("Fix the stylesheet");
});

it("keeps native theme settings free of compatibility notices", () => {
  const { rerender } = render(<ThemeCompatibilityNotice compatibility={{ kind: "native", warnings: [] }} translate={translate} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  rerender(<ThemeCompatibilityNotice translate={translate} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
