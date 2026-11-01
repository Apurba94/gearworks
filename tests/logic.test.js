import assert from "node:assert/strict";
import test from "node:test";
import { Bench, COLS, DIRS, Factory, LEVELS, ROWS, key, makeLevel, route } from "../src/logic.js";

/** A small hand-built level: a source at the top, one crate straight below it. */
function simple(color = 0) {
  return { source: { c: 3, r: 0, dir: 2 }, crates: [{ c: 3, r: 4, color, need: 3 }], rocks: [], feed: [color], rounds: 3, par: 3, stock: { belt: 6, sortL: 1, sortR: 1, paint: 1 } };
}
const belts = (...rows) => new Map(rows.map((r) => [key(3, r), { type: "belt", dir: 2 }]));

test("belts carry parts into a crate", () => {
  const f = new Factory(simple(), belts(1, 2, 3)).run();
  assert.equal(f.state, "done");
  assert.deepEqual(f.got, [3]);
});

test("a gap drops a part on the floor", () => {
  const f = new Factory(simple(), belts(1, 3)).run();
  assert.equal(f.state, "failed");
  assert.match(f.why, /fell off/);
  assert.deepEqual(f.at, [3, 2]);
});

test("the wrong colour in a crate stops the line", () => {
  const lv = simple(0);
  lv.feed = [1];
  const f = new Factory(lv, belts(1, 2, 3)).run();
  assert.equal(f.state, "failed");
  assert.match(f.why, /wrong crate/);
});

test("a paint booth changes a part's colour", () => {
  const lv = simple(0);
  lv.feed = [1];
  const t = belts(1, 2, 3);
  t.set(key(3, 2), { type: "paint", dir: 2, color: 0 });
  assert.equal(new Factory(lv, t).run().state, "done");
});

test("sorters turn their own colour and pass the others straight on", () => {
  const item = { color: 1 };
  assert.equal(route({ type: "sortL", dir: 2, color: 1 }, item), 1);     // heading down, left is east on screen
  assert.equal(route({ type: "sortR", dir: 2, color: 1 }, item), 3);
  assert.equal(route({ type: "sortL", dir: 2, color: 0 }, item), 2);
  assert.equal(route({ type: "belt", dir: 0 }, item), 0);
});

test("two colours can be split between two crates", () => {
  const lv = simple(0);
  lv.crates = [{ c: 3, r: 4, color: 0, need: 3 }, { c: 5, r: 2, color: 1, need: 3 }];
  lv.feed = [0, 1];
  const t = belts(1, 2, 3);
  t.set(key(3, 2), { type: "sortL", dir: 2, color: 1 });
  t.set(key(4, 2), { type: "belt", dir: 1 });
  const f = new Factory(lv, t).run();
  assert.equal(f.state, "done");
  assert.deepEqual(f.got, [3, 3]);
});

test("a loop cannot run forever", () => {
  const lv = simple();
  const t = new Map([[key(3, 1), { type: "belt", dir: 1 }], [key(4, 1), { type: "belt", dir: 2 }], [key(4, 2), { type: "belt", dir: 3 }], [key(3, 2), { type: "belt", dir: 0 }]]);
  const f = new Factory(lv, t).run();
  assert.equal(f.state, "failed");
  assert.match(f.why, /stalled/);
});

test("the bench respects stock, rocks and fixed machines", () => {
  const b = new Bench({ ...simple(), rocks: [[1, 1]], stock: { belt: 1, sortL: 0, sortR: 0, paint: 0 } });
  assert.equal(b.place("belt", 1, 1), false);
  assert.equal(b.place("belt", 3, 0), false);
  assert.equal(b.place("belt", 3, 4), false);
  assert.equal(b.place("belt", -1, 2), false);
  assert.equal(b.place("sortL", 2, 2), false);
  assert.ok(b.place("belt", 2, 2));
  assert.equal(b.place("belt", 2, 3), false);
  assert.equal(b.left("belt"), 0);
  assert.ok(b.remove(2, 2));
  assert.equal(b.left("belt"), 1);
});

test("tapping a tile turns it, and sorters change colour", () => {
  const b = new Bench(simple());
  b.place("belt", 2, 2, 2);
  b.place("belt", 2, 2);
  assert.equal(b.tiles.get(key(2, 2)).dir, 3);
  assert.equal(b.recolor(2, 2), false);
  b.place("sortL", 4, 2);
  assert.ok(b.recolor(4, 2));
  assert.equal(b.tiles.get(key(4, 2)).color, 1);
});

test("swapping a tile keeps its direction", () => {
  const b = new Bench(simple());
  b.place("belt", 2, 2, 1);
  b.place("sortL", 2, 2);
  assert.equal(b.tiles.get(key(2, 2)).dir, 1);
  assert.equal(b.left("belt"), 6);
});

test("stars follow the number of tiles", () => {
  const lv = simple();
  const b = new Bench(lv);
  b.load([1, 2, 3].map((r) => ({ c: 3, r, type: "belt", dir: 2 })));
  assert.equal(b.stars(), 3);
  b.place("belt", 0, 5);
  b.place("belt", 0, 6);
  assert.equal(b.stars(), 2);
  b.place("belt", 0, 7);
  assert.equal(b.stars(), 1);
});

test("all 40 factories can be solved for three stars with the tiles provided", () => {
  for (let i = 0; i < LEVELS; i++) {
    const lv = makeLevel(i);
    const b = new Bench(lv);
    for (const { c, r, type, dir, color } of lv.answer) {
      assert.equal(b.blocked(c, r), false, `level ${i + 1}`);
      b.tiles.set(key(c, r), { type, dir, color });
      assert.ok(b.left(type) >= 0, `level ${i + 1} stock of ${type}`);
    }
    assert.equal(b.factory().run().state, "done", `level ${i + 1}`);
    assert.equal(b.stars(), 3);
  }
});

test("factories grow, and they are all different", () => {
  const seen = new Set();
  for (let i = 0; i < LEVELS; i++) {
    const lv = makeLevel(i);
    seen.add(JSON.stringify([lv.source, lv.crates, lv.rocks]));
    assert.ok(lv.source.c >= 0 && lv.source.c < COLS);
    for (const k of lv.crates) assert.ok(k.r < ROWS);
  }
  assert.equal(seen.size, LEVELS);
  assert.ok(makeLevel(30).crates.length > makeLevel(0).crates.length);
  assert.ok(makeLevel(35).par > makeLevel(1).par);
});

test("sorters and paint appear as the game goes on", () => {
  const kinds = new Set();
  for (let i = 0; i < LEVELS; i++) for (const t of makeLevel(i).answer) kinds.add(t.type);
  assert.deepEqual([...kinds].sort(), ["belt", "paint", "sortL", "sortR"]);
  assert.ok(makeLevel(0).answer.every((t) => t.type === "belt"));
});

test("direction tables stay consistent", () => {
  assert.deepEqual(DIRS[0], [0, -1]);
  assert.deepEqual(DIRS[2], [0, 1]);
});
