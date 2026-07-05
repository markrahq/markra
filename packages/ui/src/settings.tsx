import { Children, type ComponentPropsWithoutRef, type ReactNode, useId } from "react";

import { Button, type ButtonProps } from "./Button";
import { mergeClassNames } from "./classes";
import { Switch, type SwitchProps } from "./Switch";

function getTextContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function getIdSlug(value: ReactNode): string {
  return getTextContent(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type SettingsSectionProps = Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> & {
  actions?: ReactNode;
  actionsClassName?: string;
  children: ReactNode;
  contentClassName?: string;
  footer?: ReactNode;
  footerClassName?: string;
  headerClassName?: string;
  headingClassName?: string;
  intro?: ReactNode;
  introClassName?: string;
  label?: ReactNode;
  title?: ReactNode;
};

export function SettingsSection({
  actions,
  actionsClassName,
  children,
  className,
  contentClassName,
  footer,
  footerClassName,
  headerClassName,
  headingClassName,
  id,
  intro,
  introClassName,
  label,
  title,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: SettingsSectionProps) {
  const resolvedLabel = label ?? title;
  const generatedId = useId().replace(/:/g, "");
  const labelSlug = getIdSlug(resolvedLabel);
  const headingId = id ? `${id}-title` : `settings-section-${labelSlug || generatedId}`;
  const hasMultipleRows = Children.count(children) > 1;

  return (
    <section
      {...props}
      id={id}
      className={mergeClassNames("settings-section mb-8 last:mb-0", className)}
      aria-labelledby={ariaLabelledBy ?? (resolvedLabel ? headingId : undefined)}
    >
      {resolvedLabel || actions ? (
        <div
          className={mergeClassNames(
            "settings-section-header mb-3 flex min-w-0 items-start justify-between gap-3",
            headerClassName
          )}
        >
          {resolvedLabel ? (
            <h3
              className={mergeClassNames(
                "settings-section-title m-0 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)",
                headingClassName
              )}
              id={headingId}
            >
              {resolvedLabel}
            </h3>
          ) : null}
          {actions ? (
            <div className={mergeClassNames("settings-section-actions flex shrink-0 items-center gap-2", actionsClassName)}>
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {intro ? <div className={mergeClassNames("settings-section-intro mb-3", introClassName)}>{intro}</div> : null}
      <div
        className={mergeClassNames(
          "settings-list-group",
          hasMultipleRows && "divide-y divide-(--border-default)",
          contentClassName
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className={mergeClassNames("settings-section-footer mt-3", footerClassName)}>{footer}</div>
      ) : null}
    </section>
  );
}

export type SettingsRowProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  action?: ReactNode;
  actionClassName?: string;
  contentClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  leading?: ReactNode;
  leadingClassName?: string;
  meta?: ReactNode;
  metaClassName?: string;
  title: ReactNode;
  titleClassName?: string;
};

function getSettingsRowGridClassName(hasLeading: boolean, hasAction: boolean) {
  if (hasLeading && hasAction) return "grid-cols-[auto_minmax(0,1fr)_auto]";
  if (hasLeading) return "grid-cols-[auto_minmax(0,1fr)]";
  if (hasAction) return "grid-cols-[minmax(0,1fr)_auto]";
  return "grid-cols-[minmax(0,1fr)]";
}

export function SettingsRow({
  action,
  actionClassName,
  className,
  contentClassName,
  description,
  descriptionClassName,
  leading,
  leadingClassName,
  meta,
  metaClassName,
  title,
  titleClassName,
  ...props
}: SettingsRowProps) {
  return (
    <div
      {...props}
      className={mergeClassNames(
        "settings-row grid min-h-15 items-center gap-5 py-4",
        getSettingsRowGridClassName(Boolean(leading), Boolean(action)),
        className
      )}
    >
      {leading ? (
        <div className={mergeClassNames("settings-row-leading flex shrink-0 items-center", leadingClassName)}>
          {leading}
        </div>
      ) : null}
      <div className={mergeClassNames("settings-row-content min-w-0", contentClassName)}>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={mergeClassNames(
              "settings-row-title m-0 min-w-0 text-[13px] leading-5 font-[650] tracking-normal text-(--text-heading)",
              titleClassName
            )}
          >
            {title}
          </div>
          {meta ? (
            <div className={mergeClassNames("settings-row-meta flex shrink-0 items-center", metaClassName)}>
              {meta}
            </div>
          ) : null}
        </div>
        {description ? (
          <div
            className={mergeClassNames(
              "settings-row-description m-0 mt-0.5 text-[12px] leading-4.5 font-[450] text-(--text-secondary)",
              descriptionClassName
            )}
          >
            {description}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className={mergeClassNames("settings-row-action flex shrink-0 items-center justify-end", actionClassName)}>
          {action}
        </div>
      ) : null}
    </div>
  );
}

export type SettingsCalloutProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  children?: ReactNode;
  contentClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  icon?: ReactNode;
  iconClassName?: string;
  title: ReactNode;
  titleClassName?: string;
};

export function SettingsCallout({
  children,
  className,
  contentClassName,
  description,
  descriptionClassName,
  icon,
  iconClassName,
  role = "note",
  title,
  titleClassName,
  "aria-label": ariaLabel,
  ...props
}: SettingsCalloutProps) {
  return (
    <div
      {...props}
      className={mergeClassNames(
        "settings-callout flex items-start gap-2.5 rounded-md bg-(--bg-secondary) px-3 py-3",
        className
      )}
      role={role}
      aria-label={ariaLabel ?? getTextContent(title)}
    >
      {icon ? (
        <span
          className={mergeClassNames(
            "settings-callout-icon mt-0.5 flex size-5 shrink-0 items-center justify-center text-(--text-secondary)",
            iconClassName
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <div className={mergeClassNames("settings-callout-content min-w-0", contentClassName)}>
        <div
          className={mergeClassNames(
            "settings-callout-title m-0 text-[12px] leading-5 font-bold tracking-normal text-(--text-heading)",
            titleClassName
          )}
        >
          {title}
        </div>
        {description ? (
          <div
            className={mergeClassNames(
              "settings-callout-description m-0 max-w-[72ch] text-[12px] leading-4.5 font-[450] text-(--text-secondary)",
              descriptionClassName
            )}
          >
            {description}
          </div>
        ) : null}
        {children ? <div className="settings-callout-children mt-2">{children}</div> : null}
      </div>
    </div>
  );
}

export type SettingsButtonProps = ButtonProps & {
  label?: string;
};

export function SettingsButton({
  children,
  className,
  label,
  size = "sm",
  "aria-label": ariaLabel,
  ...props
}: SettingsButtonProps) {
  return (
    <Button
      {...props}
      className={mergeClassNames("gap-1.5", className)}
      size={size}
      aria-label={ariaLabel ?? label}
    >
      {children}
    </Button>
  );
}

export type SettingsSwitchProps = Omit<SwitchProps, "checked" | "label" | "onCheckedChange"> & {
  checked: boolean;
  label: string;
  onChange?: (checked: boolean) => unknown;
  onCheckedChange?: (checked: boolean) => unknown;
};

export function SettingsSwitch({ checked, label, onChange, onCheckedChange, ...props }: SettingsSwitchProps) {
  return (
    <Switch
      {...props}
      checked={checked}
      label={label}
      onCheckedChange={(nextChecked) => {
        onChange?.(nextChecked);
        onCheckedChange?.(nextChecked);
      }}
    />
  );
}

export type SettingsSelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

export type SettingsSelectProps = Omit<ComponentPropsWithoutRef<"select">, "children" | "onChange" | "value"> & {
  children?: ReactNode;
  label: string;
  onChange?: (value: string) => unknown;
  onValueChange?: (value: string) => unknown;
  options?: readonly SettingsSelectOption[];
  value: string;
};

export function SettingsSelect({
  children,
  className,
  label,
  onChange,
  onValueChange,
  options,
  value,
  "aria-label": ariaLabel,
  ...props
}: SettingsSelectProps) {
  return (
    <select
      {...props}
      className={mergeClassNames(
        "h-8 min-w-36 rounded-md border border-(--border-default) bg-(--bg-primary) py-0 pr-8 pl-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
        className
      )}
      aria-label={ariaLabel ?? label}
      value={value}
      onChange={(event) => {
        onChange?.(event.currentTarget.value);
        onValueChange?.(event.currentTarget.value);
      }}
    >
      {children ??
        options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
    </select>
  );
}

export type SettingsTextInputProps = Omit<ComponentPropsWithoutRef<"input">, "onChange" | "value"> & {
  label: string;
  onChange?: (value: string) => unknown;
  onValueChange?: (value: string) => unknown;
  value: string;
  widthClassName?: string;
};

export function SettingsTextInput({
  autoCapitalize = "none",
  autoCorrect = "off",
  className,
  label,
  onChange,
  onValueChange,
  spellCheck = false,
  type = "text",
  value,
  widthClassName = "w-44",
  "aria-label": ariaLabel,
  ...props
}: SettingsTextInputProps) {
  return (
    <input
      {...props}
      className={mergeClassNames(
        "h-8 rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out placeholder:text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
        widthClassName,
        className
      )}
      type={type}
      aria-label={ariaLabel ?? label}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      spellCheck={spellCheck}
      value={value}
      onChange={(event) => {
        onChange?.(event.currentTarget.value);
        onValueChange?.(event.currentTarget.value);
      }}
    />
  );
}

export type SettingsTextareaProps = Omit<ComponentPropsWithoutRef<"textarea">, "onChange" | "value"> & {
  label: string;
  onChange?: (value: string) => unknown;
  onValueChange?: (value: string) => unknown;
  value: string;
  widthClassName?: string;
};

export function SettingsTextarea({
  autoCapitalize = "none",
  autoCorrect = "off",
  className,
  label,
  onChange,
  onValueChange,
  spellCheck = false,
  value,
  widthClassName = "w-80",
  "aria-label": ariaLabel,
  ...props
}: SettingsTextareaProps) {
  return (
    <textarea
      {...props}
      className={mergeClassNames(
        "min-h-18 resize-y rounded-md border border-(--border-default) bg-(--bg-primary) px-3 py-2 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out placeholder:text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) max-[760px]:w-full",
        widthClassName,
        className
      )}
      aria-label={ariaLabel ?? label}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      spellCheck={spellCheck}
      value={value}
      onChange={(event) => {
        onChange?.(event.currentTarget.value);
        onValueChange?.(event.currentTarget.value);
      }}
    />
  );
}

export type SettingsNumberInputProps = Omit<ComponentPropsWithoutRef<"div">, "onChange"> & {
  disabled?: boolean;
  inputClassName?: string;
  inputProps?: Omit<
    ComponentPropsWithoutRef<"input">,
    "aria-label" | "className" | "disabled" | "max" | "min" | "onChange" | "step" | "type" | "value"
  >;
  label: string;
  max?: number;
  min?: number;
  onChange?: (value: number) => unknown;
  onValueChange?: (value: number) => unknown;
  step?: number;
  unit?: ReactNode;
  unitClassName?: string;
  value: number;
};

export function SettingsNumberInput({
  className,
  disabled = false,
  inputClassName,
  inputProps,
  label,
  max,
  min,
  onChange,
  onValueChange,
  step = 1,
  unit,
  unitClassName,
  value,
  ...props
}: SettingsNumberInputProps) {
  return (
    <div {...props} className={mergeClassNames("inline-flex items-center gap-2", className)}>
      <input
        {...inputProps}
        className={mergeClassNames(
          "h-8 w-24 rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
          inputClassName
        )}
        type="number"
        aria-label={label}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          onChange?.(Number(event.currentTarget.value));
          onValueChange?.(Number(event.currentTarget.value));
        }}
      />
      {unit ? (
        <span
          className={mergeClassNames("text-[12px] leading-5 font-[560] text-(--text-secondary)", unitClassName)}
          aria-hidden="true"
        >
          {unit}
        </span>
      ) : null}
    </div>
  );
}

export type SettingsCheckboxProps = Omit<ComponentPropsWithoutRef<"label">, "children" | "onChange"> & {
  checked: boolean;
  disabled?: boolean;
  inputClassName?: string;
  inputProps?: Omit<
    ComponentPropsWithoutRef<"input">,
    "aria-label" | "checked" | "className" | "disabled" | "onChange" | "type"
  >;
  label: ReactNode;
  labelClassName?: string;
  onChange?: (checked: boolean) => unknown;
  onCheckedChange?: (checked: boolean) => unknown;
};

export function SettingsCheckbox({
  checked,
  className,
  disabled = false,
  inputClassName,
  inputProps,
  label,
  labelClassName,
  onChange,
  onCheckedChange,
  ...props
}: SettingsCheckboxProps) {
  return (
    <label
      {...props}
      className={mergeClassNames(
        "inline-flex h-8 items-center gap-2 text-[12px] leading-5 font-[560] text-(--text-heading)",
        className
      )}
    >
      <input
        {...inputProps}
        className={mergeClassNames("size-4 rounded border-(--border-default) accent-(--accent)", inputClassName)}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={typeof label === "string" ? label : undefined}
        onChange={(event) => {
          onChange?.(event.currentTarget.checked);
          onCheckedChange?.(event.currentTarget.checked);
        }}
      />
      <span className={labelClassName}>{label}</span>
    </label>
  );
}
