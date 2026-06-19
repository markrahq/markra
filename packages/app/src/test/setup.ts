import * as matchers from "@testing-library/jest-dom/matchers";
import { expect, vi } from "vitest";

expect.extend(matchers);

const testRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({})
};

function getClientRects() {
  return [testRect] as unknown as DOMRectList;
}

function getBoundingClientRect() {
  return testRect as DOMRect;
}

type TextLayoutPrototype = Text & {
  getClientRects?: typeof getClientRects;
  getBoundingClientRect?: typeof getBoundingClientRect;
};

const textPrototype = Text.prototype as TextLayoutPrototype;

if (!textPrototype.getClientRects) {
  textPrototype.getClientRects = getClientRects;
}

if (!textPrototype.getBoundingClientRect) {
  textPrototype.getBoundingClientRect = getBoundingClientRect;
}

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = getClientRects;
}

if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = getBoundingClientRect;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollBy", {
    configurable: true,
    writable: true,
    value: vi.fn()
  });
}

type SvgLayoutPrototype = SVGElement & {
  getBBox?: () => DOMRect;
};

if (typeof SVGElement !== "undefined") {
  const svgPrototype = SVGElement.prototype as SvgLayoutPrototype;

  if (!svgPrototype.getBBox) {
    svgPrototype.getBBox = getBoundingClientRect;
  }
}
