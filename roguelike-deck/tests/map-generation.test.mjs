import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let mapModule;

// mulberry32 シード付き PRNG（定数 rng と異なり実際に分岐を生成する）
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

before(async () => {
  const loaded = await runnerImport("./src/core/map.ts");
  mapModule = loaded.module;
});

// DAG をスタートから再帰的に辿り、ボスまでのすべてのパスを列挙する
function getAllPaths(map) {
  const nodeMap = new Map(map.nodes.map((n) => [n.id, n]));
  const paths = [];

  function dfs(nodeId, path) {
    const node = nodeMap.get(nodeId);
    if (node === undefined) return;
    const newPath = [...path, node];
    if (node.nextNodeIds.length === 0) {
      paths.push(newPath);
      return;
    }
    for (const nextId of node.nextNodeIds) {
      dfs(nextId, newPath);
    }
  }

  for (const startId of map.startNodeIds) {
    dfs(startId, []);
  }
  return paths;
}

function assertMapValid(map, seed) {
  const label = `seed=${seed}`;
  const nodeMap = new Map(map.nodes.map((n) => [n.id, n]));

  // スタートノードが floor 1 であること
  for (const id of map.startNodeIds) {
    const node = nodeMap.get(id);
    assert.ok(
      node !== undefined,
      `${label}: startNodeId ${id} が nodes に存在しない`,
    );
    assert.equal(
      node.floor,
      1,
      `${label}: スタートノードは floor 1 でなければならない`,
    );
  }

  // ボスノードが floor 15 かつ kind=boss であること
  const bossNode = nodeMap.get(map.bossNodeId);
  assert.ok(
    bossNode !== undefined,
    `${label}: bossNodeId が nodes に存在しない`,
  );
  assert.equal(
    bossNode.floor,
    15,
    `${label}: ボスは floor 15 でなければならない`,
  );
  assert.equal(
    bossNode.kind,
    "boss",
    `${label}: ボスの kind は "boss" でなければならない`,
  );

  // フロアルール：floor 1-2 は battle のみ、floor 14 は rest のみ、floor 15 は boss のみ
  for (const node of map.nodes) {
    if (node.floor === 1 || node.floor === 2) {
      assert.equal(
        node.kind,
        "battle",
        `${label}: floor ${node.floor} は battle のみ許可 (got ${node.kind})`,
      );
    }
    if (node.floor === 14) {
      assert.equal(
        node.kind,
        "rest",
        `${label}: floor 14 は rest のみ許可 (got ${node.kind})`,
      );
    }
    if (node.floor === 15) {
      assert.equal(
        node.kind,
        "boss",
        `${label}: floor 15 は boss のみ許可 (got ${node.kind})`,
      );
    }
  }

  // すべてのエッジが floor N → N+1 であること
  for (const node of map.nodes) {
    for (const nextId of node.nextNodeIds) {
      const nextNode = nodeMap.get(nextId);
      assert.ok(
        nextNode !== undefined,
        `${label}: nextNodeId ${nextId} が nodes に存在しない`,
      );
      assert.equal(
        nextNode.floor,
        node.floor + 1,
        `${label}: エッジは floor N → N+1 でなければならない (${node.floor} → ${nextNode.floor})`,
      );
    }
  }

  // スタートから全ノードが到達可能であること
  const reachable = new Set();
  const queue = [...map.startNodeIds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const nextId of nodeMap.get(id)?.nextNodeIds ?? []) {
      queue.push(nextId);
    }
  }
  for (const node of map.nodes) {
    assert.ok(
      reachable.has(node.id),
      `${label}: node ${node.id} (floor ${node.floor}) がスタートから到達不能`,
    );
  }

  // 全ノードからボスが到達可能であること（逆方向 BFS）
  const reverseEdges = new Map();
  for (const node of map.nodes) {
    for (const nextId of node.nextNodeIds) {
      if (!reverseEdges.has(nextId)) reverseEdges.set(nextId, []);
      reverseEdges.get(nextId).push(node.id);
    }
  }
  const canReachBoss = new Set();
  const bossQueue = [map.bossNodeId];
  while (bossQueue.length > 0) {
    const id = bossQueue.shift();
    if (canReachBoss.has(id)) continue;
    canReachBoss.add(id);
    for (const parentId of reverseEdges.get(id) ?? []) {
      bossQueue.push(parentId);
    }
  }
  for (const node of map.nodes) {
    assert.ok(
      canReachBoss.has(node.id),
      `${label}: node ${node.id} (floor ${node.floor}) からボスに到達不能`,
    );
  }

  // バランス制約：連続ショップなし、3連続イベントなし
  const paths = getAllPaths(map);
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      if (path[i].kind === "shop" && path[i + 1].kind === "shop") {
        assert.fail(
          `${label}: floor ${path[i].floor}-${path[i + 1].floor} で連続ショップが発生`,
        );
      }
    }
    for (let i = 0; i + 2 < path.length; i++) {
      if (
        path[i].kind === "event" &&
        path[i + 1].kind === "event" &&
        path[i + 2].kind === "event"
      ) {
        assert.fail(
          `${label}: floor ${path[i].floor}-${path[i + 2].floor} で3連続イベントが発生`,
        );
      }
    }
  }
}

test("generateFloorMap は 100 シードすべてで有効なマップを生成する", () => {
  for (let seed = 0; seed < 100; seed++) {
    const rng = mulberry32(seed);
    const map = mapModule.generateFloorMap(rng);
    assertMapValid(map, seed);
  }
});

test("seed=42 のマップは分岐構造を持つ", () => {
  const map = mapModule.generateFloorMap(mulberry32(42));

  // 15 フロア × 1 ノード以上 → 分岐があれば 15 より多い
  assert.ok(
    map.nodes.length > 15,
    `分岐マップを期待したが ${map.nodes.length} ノードしかない`,
  );

  // 少なくとも 1 フロアが複数ノードを持つこと
  const floorCounts = new Map();
  for (const node of map.nodes) {
    floorCounts.set(node.floor, (floorCounts.get(node.floor) ?? 0) + 1);
  }
  const hasBranching = [...floorCounts.values()].some((count) => count > 1);
  assert.ok(hasBranching, "少なくとも 1 フロアに複数ノードが必要");
});

test("FLOOR_RULES と FLOOR_WEIGHTS は整合する", () => {
  const { FLOOR_RULES, FLOOR_WEIGHTS } = mapModule;

  for (let floor = 1; floor <= 15; floor++) {
    const rules = FLOOR_RULES[floor];
    const weights = FLOOR_WEIGHTS[floor];
    assert.ok(rules !== undefined, `FLOOR_RULES に floor ${floor} がない`);
    assert.ok(weights !== undefined, `FLOOR_WEIGHTS に floor ${floor} がない`);

    for (const kind of Object.keys(weights)) {
      assert.ok(
        rules.includes(kind),
        `FLOOR_WEIGHTS の floor ${floor} に "${kind}" があるが FLOOR_RULES に含まれていない`,
      );
    }
  }
});
