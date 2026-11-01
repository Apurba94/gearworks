// Gearworks rules: parts ride belts through sorters and paint booths into crates. No drawing here, so it can be tested.
import { Rng } from "./gamekit.js";

export const COLS = 7, ROWS = 9, LEVELS = 40;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left
export const COLORS = ["#ef4444", "#3b82f6", "#eab308"];
export const COLOR_NAMES = ["red", "blue", "yellow"];
export const LIMIT = 260;

const key = (c, r) => c + "," + r;
const inside = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const left = (d) => (d + 3) % 4;
const right = (d) => (d + 1) % 4;

/** Which way a tile sends an item. A part keeps its colour unless the tile is a paint booth. */
export function route(tile, item) {
  if (tile.type === "belt") return tile.dir;
  if (tile.type === "paint") { item.color = tile.color; return tile.dir; }
  if (tile.type === "sortL") return item.color === tile.color ? left(tile.dir) : tile.dir;
  if (tile.type === "sortR") return item.color === tile.color ? right(tile.dir) : tile.dir;
  return null;
}

export class Factory {
  constructor(level, tiles) {
    this.level = level;
    this.tiles = tiles;
    this.items = [];
    this.tick = 0;
    this.emitted = 0;
    this.got = level.crates.map(() => 0);
    this.state = "running";
    this.why = "";
    this.at = null;
  }
  fail(why, c, r) { this.state = "failed"; this.why = why; this.at = c == null ? null : [c, r]; }
  step() {
    if (this.state !== "running") return;
    const lv = this.level;
    this.tick++;
    const done = [];
    for (const it of this.items) {
      it.px = it.c; it.py = it.r;
      const d = it.dir;
      it.c += DIRS[d][0];
      it.r += DIRS[d][1];
      const crate = lv.crates.findIndex((k) => k.c === it.c && k.r === it.r);
      if (crate >= 0) {
        if (lv.crates[crate].color !== it.color) return this.fail(`A ${COLOR_NAMES[it.color]} part went into the wrong crate`, it.c, it.r);
        this.got[crate]++;
        done.push(it);
        continue;
      }
      const t = this.tiles.get(key(it.c, it.r));
      if (!t) return this.fail("A part fell off the belt", it.c, it.r);
      it.dir = route(t, it);
    }
    this.items = this.items.filter((i) => !done.includes(i));
    if (this.tick % 2 === 1 && this.emitted < this.need()) {
      const s = lv.source;
      const color = lv.feed[this.emitted % lv.feed.length];
      const item = { c: s.c, r: s.r, px: s.c, py: s.r, dir: s.dir, color, id: this.emitted };
      this.emitted++;
      this.items.push(item);
    }
    if (lv.crates.every((k, i) => this.got[i] >= k.need)) this.state = "done";
    else if (this.tick > LIMIT) this.fail("The line stalled");
    else if (this.emitted >= this.need() && !this.items.length) this.fail("Not enough parts reached the crates");
  }
  need() { return this.level.feed.length * this.level.rounds; }
  run() { while (this.state === "running") this.step(); return this; }
}

function pathTo(rock, used, from, goal) {
  const start = key(from.c, from.r);
  const prev = new Map([[start, null]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    for (let d = 0; d < 4; d++) {
      const n = { c: p.c + DIRS[d][0], r: p.r + DIRS[d][1] };
      const k = key(n.c, n.r);
      if (!inside(n.c, n.r) || prev.has(k) || rock.has(k)) continue;
      if (n.c === goal.c && n.r === goal.r) {
        prev.set(k, p);
        const out = [];
        for (let cur = n; cur; cur = prev.get(key(cur.c, cur.r))) out.unshift(cur);
        return out;
      }
      if (used.has(k)) continue;
      prev.set(k, p);
      q.push(n);
    }
  }
  return null;
}

const dirOf = (a, b) => DIRS.findIndex(([x, y]) => x === b.c - a.c && y === b.r - a.r);

/** Build a level by laying a working factory first, so that each puzzle has a known answer. */
function attempt(i, n) {
  const rng = new Rng(777 + i * 61 + n * 8191);
  const paint = i >= 12 && i % 3 === 0;
  const colors = i < 4 ? 1 : i < 18 || paint ? 2 : 3;
  const rock = new Set();
  const rocks = Math.min(9, 1 + Math.floor(i / 3));
  while (rock.size < rocks) rock.add(key(rng.int(0, COLS - 1), rng.int(1, ROWS - 2)));
  const scol = rng.int(1, COLS - 2);
  const source = { c: scol, r: 0 };
  rock.delete(key(source.c, source.r));
  const order = rng.shuffle([0, 1, 2]).slice(0, colors);
  const crateSpots = rng.shuffle(Array.from({ length: COLS }, (_, c) => c)).slice(0, colors).map((c, k) => ({ c, r: ROWS - 1 - (k === 1 ? rng.int(0, 2) : 0) }));
  const crates = order.map((color, k) => ({ ...crateSpots[k], color, need: 3 }));
  for (const k of crates) rock.delete(key(k.c, k.r));
  const used = new Set([key(source.c, source.r)]);
  for (const k of crates) used.add(key(k.c, k.r));
  const first = { c: source.c, r: 1 };
  if (rock.has(key(first.c, first.r))) rock.delete(key(first.c, first.r));
  used.add(key(first.c, first.r));
  source.dir = 2;
  const tiles = new Map();
  const free = new Set(used);
  free.delete(key(first.c, first.r));
  const lay = (path) => {
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k], b = path[k + 1];
      const old = tiles.get(key(a.c, a.r));
      const d = dirOf(a, b);
      if (!old) tiles.set(key(a.c, a.r), { type: "belt", dir: d });
      used.add(key(a.c, a.r));
    }
  };
  const main = pathTo(rock, new Set([...used].filter((u) => u !== key(first.c, first.r))), first, crates[0]);
  if (!main || main.length < 4) return null;
  lay(main);
  // Each further crate branches from the line through a sorter.
  const line = main.slice(1, -1);
  for (let k = 1; k < colors; k++) {
    let done = false;
    for (const p of rng.shuffle([...line])) {
      const t = tiles.get(key(p.c, p.r));
      if (t.type !== "belt") continue;
      for (const [kind, turn] of rng.shuffle([["sortL", left], ["sortR", right]])) {
        const d = turn(t.dir);
        const out = { c: p.c + DIRS[d][0], r: p.r + DIRS[d][1] };
        if (!inside(out.c, out.r) || rock.has(key(out.c, out.r)) || used.has(key(out.c, out.r))) continue;
        const onward = out.c === crates[k].c && out.r === crates[k].r ? [out] : pathTo(rock, used, out, crates[k]);
        if (!onward) continue;
        const old = { ...t };
        tiles.set(key(p.c, p.r), { type: kind, dir: old.dir, color: crates[k].color });
        lay(onward);
        line.push(...onward.slice(0, -1));
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) return null;
  }
  const feed = order.flatMap((c) => [c]);
  if (paint) {
    // A booth on the last tile before the first crate: the chute sends a colour no crate wants, and the booth corrects it.
    const last = main[main.length - 2];
    const b = tiles.get(key(last.c, last.r));
    if (!b || b.type !== "belt") return null;
    tiles.set(key(last.c, last.r), { type: "paint", dir: b.dir, color: order[0] });
    feed[0] = [0, 1, 2].find((x) => !order.includes(x));
  }
  const lvl = { index: i, source, crates, rocks: [...rock].filter((k) => !tiles.has(k) && !used.has(k)).map((k) => k.split(",").map(Number)), feed, rounds: 3 };
  lvl.answer = [...tiles.entries()].map(([k, t]) => { const [c, r] = k.split(",").map(Number); return { c, r, ...t }; });
  const stock = { belt: 0, sortL: 0, sortR: 0, paint: 0 };
  for (const t of lvl.answer) stock[t.type]++;
  lvl.par = lvl.answer.length;
  lvl.stock = { ...stock, belt: stock.belt + 4 };
  const check = new Factory(lvl, tiles).run();
  return check.state === "done" ? lvl : null;
}

const memo = new Map();
export function makeLevel(i) {
  if (memo.has(i)) return memo.get(i);
  for (let n = 0; n < 400; n++) {
    const lv = attempt(i, n);
    if (lv && lv.par >= Math.min(4 + Math.floor(i / 2), 12)) { memo.set(i, lv); return lv; }
  }
  for (let n = 400; n < 4000; n++) {
    const lv = attempt(i, n);
    if (lv) { memo.set(i, lv); return lv; }
  }
  throw new Error("no level " + i);
}

/** The player's bench: the tiles placed on the floor, within the stock the level allows. */
export class Bench {
  constructor(level) {
    this.level = level;
    this.tiles = new Map();
    this.colors = {};
  }
  blocked(c, r) {
    const lv = this.level;
    return !inside(c, r) || lv.rocks.some(([x, y]) => x === c && y === r) || (lv.source.c === c && lv.source.r === r) || lv.crates.some((k) => k.c === c && k.r === r);
  }
  left(type) { return this.level.stock[type] - [...this.tiles.values()].filter((t) => t.type === type).length; }
  place(type, c, r, dir = 2, color = 0) {
    if (this.blocked(c, r)) return false;
    const old = this.tiles.get(key(c, r));
    if (old?.type === type) { old.dir = (old.dir + 1) % 4; return true; }
    if (this.left(type) <= 0) return false;
    this.tiles.set(key(c, r), { type, dir: old ? old.dir : dir, color });
    return true;
  }
  /** Change the colour a sorter or booth works on. */
  recolor(c, r) {
    const t = this.tiles.get(key(c, r));
    if (!t || t.type === "belt") return false;
    t.color = (t.color + 1) % COLORS.length;
    return true;
  }
  remove(c, r) { return this.tiles.delete(key(c, r)); }
  used() { return this.tiles.size; }
  factory() { return new Factory(this.level, this.tiles); }
  stars() { const over = this.used() - this.level.par; return over <= 0 ? 3 : over <= 2 ? 2 : 1; }
  load(answer) { this.tiles = new Map(answer.map(({ c, r, ...t }) => [key(c, r), { ...t }])); }
}

export { key };
