import { ChevronDown, type LucideIcon } from "lucide-react";
import { Children, type ReactNode } from "react";
import { Button, Switch } from "@markra/ui";

export function SettingsSection({
  children,
  intro,
  label
}: {
  children: ReactNode;
  intro?: ReactNode;
  label: string;
}) {
  const sectionId = `settings-section-${label.replace(/\s+/g, "-")}`;
  const hasMultipleRows = Children.count(children) > 1;

  return (
    <section className="settings-section mb-8 last:mb-0" aria-labelledby={sectionId}>
      <h3
        className="m-0 mb-3 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)"
        id={sectionId}
      >
        {label}
      </h3>
      {intro ? <div className="mb-3">{intro}</div> : null}
      <div className={hasMultipleRows ? "settings-list-group divide-y divide-(--border-default)" : "settings-list-group"}>
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  action,
  description,
  title
}: {
  action?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="settings-row grid min-h-15 grid-cols-[minmax(0,1fr)_auto] items-center gap-5 py-4">
      <div className="min-w-0">
        <p className="m-0 text-[13px] leading-5 font-[650] tracking-normal text-(--text-heading)">{title}</p>
        {description ? (
          <p className="m-0 mt-0.5 text-[12px] leading-4.5 font-[450] text-(--text-secondary)">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center justify-end">{action}</div> : null}
    </div>
  );
}

export function SettingsCallout({
  description,
  icon: Icon,
  title
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div
      className="settings-callout flex items-start gap-2.5 rounded-md bg-(--bg-secondary) px-3 py-3"
      role="note"
      aria-label={title}
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-(--text-secondary)" aria-hidden="true">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[12px] leading-5 font-bold tracking-normal text-(--text-heading)">{title}</p>
        <p className="m-0 max-w-[72ch] text-[12px] leading-4.5 font-[450] text-(--text-secondary)">{description}</p>
      </div>
    </div>
  );
}

export function SettingsSwitch({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: () => unknown;
}) {
  return <Switch checked={checked} label={label} onCheckedChange={onChange} />;
}

export function SettingsSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => unknown;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        className="h-8 min-w-36 appearance-none rounded-md border border-(--border-default) bg-(--bg-primary) py-0 pr-8 pl-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-(--text-secondary)"
        size={13}
      />
    </div>
  );
}

export function SettingsTextInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
  widthClassName = "w-44"
}: {
  label: string;
  onChange: (value: string) => unknown;
  placeholder?: string;
  type?: "password" | "text";
  value: string;
  widthClassName?: string;
}) {
  return (
    <input
      className={`h-8 ${widthClassName} rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out placeholder:text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)`}
      type={type}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function SettingsTextarea({
  className,
  label,
  onChange,
  spellCheck,
  value,
  widthClassName = "w-80"
}: {
  className?: string;
  label: string;
  onChange: (value: string) => unknown;
  spellCheck?: boolean;
  value: string;
  widthClassName?: string;
}) {
  return (
    <textarea
      className={`min-h-18 ${widthClassName} resize-y rounded-md border border-(--border-default) bg-(--bg-primary) px-3 py-2 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out placeholder:text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) max-[760px]:w-full ${className ?? ""}`}
      aria-label={label}
      spellCheck={spellCheck}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function SettingsNumberInput({
  label,
  max,
  min,
  onChange,
  step = 1,
  unit,
  value
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => unknown;
  step?: number;
  unit?: string;
  value: number;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        className="h-8 w-24 rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {unit ? (
        <span className="text-[12px] leading-5 font-[560] text-(--text-secondary)" aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

export function SettingsCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: () => unknown;
}) {
  return (
    <label className="inline-flex h-8 items-center gap-2 text-[12px] leading-5 font-[560] text-(--text-heading)">
      <input
        className="size-4 rounded border-(--border-default) accent-(--accent)"
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

export function SettingsButton({
  children,
  disabled = false,
  label,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => unknown;
}) {
  return (
    <Button
      className="gap-1.5"
      disabled={disabled}
      size="sm"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
