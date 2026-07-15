import { createElement as createLucideElement } from "lucide";

type LucideIconNode = Parameters<typeof createLucideElement>[0];

export function createLucideIcon(ownerDocument: Document, iconNode: LucideIconNode, className: string) {
  const icon = createLucideElement(iconNode, {
    "aria-hidden": "true",
    class: `markra-lucide-icon ${className}`,
    focusable: "false"
  });

  // Lucide creates the SVG in the global document; preserve the caller's document for embedded surfaces.
  return icon.ownerDocument === ownerDocument ? icon : ownerDocument.importNode(icon, true);
}
