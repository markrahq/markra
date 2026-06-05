import { popoverPosition } from "./popover";

describe("popoverPosition", () => {
  it("places a popover below the anchor when there is room", () => {
    expect(
      popoverPosition(
        { bottom: 120, left: 50, right: 70, top: 96 },
        { height: 160, width: 240 },
        { height: 600, width: 800 }
      )
    ).toEqual({
      left: 50,
      maxHeight: 464,
      placement: "bottom",
      top: 128
    });
  });

  it("flips a popover above the anchor when the lower viewport would clip it", () => {
    expect(
      popoverPosition(
        { bottom: 578, left: 120, right: 140, top: 560 },
        { height: 220, width: 240 },
        { height: 640, width: 800 }
      )
    ).toEqual({
      left: 120,
      maxHeight: 544,
      placement: "top",
      top: 332
    });
  });

  it("clamps a popover inside the horizontal viewport margin", () => {
    expect(
      popoverPosition(
        { bottom: 120, left: 300, right: 320, top: 96 },
        { height: 160, width: 120 },
        { height: 600, width: 360 }
      ).left
    ).toBe(232);
  });

  it("limits height when neither side has enough vertical room", () => {
    expect(
      popoverPosition(
        { bottom: 220, left: 80, right: 100, top: 200 },
        { height: 500, width: 240 },
        { height: 300, width: 800 }
      )
    ).toEqual({
      left: 80,
      maxHeight: 184,
      placement: "top",
      top: 8
    });
  });
});
