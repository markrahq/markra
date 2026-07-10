import type { TestAPI } from "vitest";
import { createShardedTest, runsInTestShard } from "./shard";

function createTestRegistrar() {
  const registered = vi.fn();
  const skipped = vi.fn();
  const eachCases: unknown[][] = [];
  const each = vi.fn((cases: readonly unknown[]) => {
    eachCases.push([...cases]);
    return vi.fn();
  });
  const registerTest = Object.assign(registered, { each, skip: skipped }) as unknown as TestAPI;

  return { eachCases, registered, registerTest, skipped };
}

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

describe("createShardedTest", () => {
  it("registers selected tests and skips tests assigned to another shard", () => {
    const { registered, registerTest, skipped } = createTestRegistrar();
    const shardedTest = createShardedTest(registerTest, "1/2");

    shardedTest("gamma", vi.fn());
    shardedTest("alpha", vi.fn());

    expect(registered).toHaveBeenCalledOnce();
    expect(registered).toHaveBeenCalledWith("gamma", expect.any(Function));
    expect(skipped).toHaveBeenCalledOnce();
    expect(skipped).toHaveBeenCalledWith("alpha", expect.any(Function));
  });

  it("partitions parameterized cases across shards without omissions or duplicates", () => {
    const cases = [
      { value: "alpha" },
      { value: "beta" },
      { value: "gamma" },
      { value: "delta" }
    ];
    const capturedCases = ["1/2", "2/2"].flatMap((shardSpec) => {
      const { eachCases, registerTest } = createTestRegistrar();
      const shardedTest = createShardedTest(registerTest, shardSpec);

      shardedTest.each(cases)("case $value", vi.fn());

      return eachCases.flat();
    });

    expect(capturedCases).toHaveLength(cases.length);
    expect(new Set(capturedCases)).toEqual(new Set(cases));
  });
});
