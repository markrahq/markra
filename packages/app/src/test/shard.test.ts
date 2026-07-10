import { runsInTestShard } from "./shard";

describe("runsInTestShard", () => {
  it("selects every test when sharding is disabled", () => {
    expect(runsInTestShard("synthetic test", undefined)).toBe(true);
    expect(runsInTestShard("synthetic test", "")).toBe(true);
  });

  it("assigns every title to exactly one shard", () => {
    const titles = ["alpha", "beta", "gamma", "delta"];

    titles.forEach((title) => {
      const matches = ["1/2", "2/2"].filter((spec) => runsInTestShard(title, spec));
      expect(matches).toHaveLength(1);
    });
  });

  it.each(["0/2", "3/2", "1/0", "invalid"])("rejects invalid shard spec %s", (spec) => {
    expect(() => runsInTestShard("synthetic test", spec)).toThrow(/MARKRA_APP_TEST_SHARD/);
  });
});
