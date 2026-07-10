import type { TestAPI, TestFunction } from "vitest";

const shardSpecPattern = /^([1-9]\d*)\/([1-9]\d*)$/;

type ShardedCaseArguments<T> = T extends readonly [...infer Arguments] ? Arguments : [T];

export type ShardedTest = {
  (name: string, handler: TestFunction): void;
  each<T>(cases: readonly T[]): (
    name: string,
    handler: (...args: ShardedCaseArguments<T>) => unknown
  ) => void;
};

function titleHash(title: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < title.length; index += 1) {
    hash ^= title.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function runsInTestShard(title: string, shardSpec: string | undefined) {
  if (!shardSpec) return true;

  const match = shardSpecPattern.exec(shardSpec);
  if (!match) throw new Error("MARKRA_APP_TEST_SHARD must use <index>/<count>.");

  const shardIndex = Number(match[1]);
  const shardCount = Number(match[2]);
  if (shardIndex > shardCount) {
    throw new Error("MARKRA_APP_TEST_SHARD index must not exceed count.");
  }

  return titleHash(title) % shardCount === shardIndex - 1;
}

function testCaseShardKey(testCase: unknown, index: number) {
  return `${index}:${JSON.stringify(testCase)}`;
}

export function createShardedTest(registerTest: TestAPI, shardSpec: string | undefined) {
  const shardedTest = ((name: string, handler: TestFunction) => {
    const test = runsInTestShard(name, shardSpec) ? registerTest : registerTest.skip;

    return test(name, handler);
  }) as ShardedTest;

  shardedTest.each = (<T>(cases: readonly T[]) => {
    const selectedCases = cases.filter((testCase, index) =>
      runsInTestShard(testCaseShardKey(testCase, index), shardSpec)
    );

    return registerTest.each(selectedCases);
  }) as ShardedTest["each"];

  return shardedTest;
}
