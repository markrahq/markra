import { render, screen } from "@testing-library/react";
import type { AiProviderConfig } from "@markra/providers";
import { AiProviderBadge } from "./AiProviderBadge";

function provider(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    enabled: true,
    id: "mock-provider",
    models: [],
    name: "gap provider",
    type: "openai-compatible",
    ...overrides
  };
}

describe("AiProviderBadge", () => {
  it("shows the OrcaRouter logo for its compatible provider entry", () => {
    render(<AiProviderBadge provider={provider({ id: "orcarouter", name: "OrcaRouter" })} translate={(key) => key} />);
    expect(screen.getByRole("img", { name: "OrcaRouter settings.ai.providerLogo" })).toHaveAttribute("src", expect.stringContaining("orcarouter"));
  });

  it("shows the Requesty logo for its compatible provider entry", () => {
    render(<AiProviderBadge provider={provider({ id: "requesty", name: "Requesty" })} translate={(key) => key} />);
    expect(screen.getByRole("img", { name: "Requesty settings.ai.providerLogo" })).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
  });

  it("uses safe line height for fallback provider initials", () => {
    render(<AiProviderBadge provider={provider()} translate={(key) => key} />);

    expect(screen.getByText("ga")).toHaveClass("leading-4");
  });
});
