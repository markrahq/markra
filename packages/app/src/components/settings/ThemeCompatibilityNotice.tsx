import type { ThemeCompatibility } from "../../lib/themes/typora";
import type { SettingsTranslate } from "./translate";

const warningKeys = {
  resources: "settings.theme.typoraResources",
  unsupported: "settings.theme.typoraUnsupported",
  syntax: "settings.theme.typoraSyntax"
} as const;

export function ThemeCompatibilityNotice({ compatibility, translate }: {
  compatibility?: ThemeCompatibility;
  translate: SettingsTranslate;
}) {
  if (compatibility?.kind !== "typora") return null;
  return (
    <div role="status" className="mb-3 text-[13px] leading-5 text-(--text-secondary)">
      <p className="m-0">{translate("settings.theme.typoraCompatibility")}</p>
      {compatibility.warnings.length > 0 ? (
        <ul className="my-1 pl-5">
          {compatibility.warnings.map((warning) => <li key={warning}>{translate(warningKeys[warning])}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
