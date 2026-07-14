import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { FileScanningSettings } from "./FileScanningSettings";

describe("FileScanningSettings", () => {
  it("keeps edits local until the user applies normalized global rules", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <FileScanningSettings
        settings={{ rules: "saved/" }}
        translate={translate}
        onApply={onApply}
      />
    );
    const textarea = screen.getByRole("textbox", { name: "Global ignore rules" });
    const applyButton = screen.getByRole("button", { name: "Apply global ignore rules" });

    expect(textarea).toHaveValue("saved/");
    expect(applyButton).toBeDisabled();

    fireEvent.change(textarea, {
      target: { value: "generated/\r\n*.tmp" }
    });

    expect(onApply).not.toHaveBeenCalled();
    expect(applyButton).toBeEnabled();

    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith({ rules: "generated/\n*.tmp" });

    rerender(
      <FileScanningSettings
        settings={{ rules: "generated/\n*.tmp" }}
        translate={translate}
        onApply={onApply}
      />
    );

    expect(applyButton).toBeDisabled();
  });
});
