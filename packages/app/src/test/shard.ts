const shardSpecPattern = /^([1-9]\d*)\/([1-9]\d*)$/;

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
