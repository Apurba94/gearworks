// Gearworks screens: the factory floor, the tile tray and the running line.
import { Game, LevelSelect, Result, Scene, Title, backdrop, compose, dot, lerp, panel, text } from "./gamekit.js";
import { Bench, COLORS, COLS, DIRS, LEVELS, ROWS, key, makeLevel } from "./logic.js";

export const game = new Game({ id: "gearworks", title: "Gearworks", theme: { accent: "#f59e0b", onAccent: "#1f1303", bg: "#0e1116", bg2: "#232a36", panel: "#2b3442" }, defaults: { stars: [] } });
const data = game.store.data;
const CELL = 50, X0 = 20;
const TOOLS = [["belt", "Belt"], ["sortL", "Sort left"], ["sortR", "Sort right"], ["paint", "Paint"], ["erase", "Erase"]];

const HELP = [
  ["The line", "Parts leave the chute at the top, one after another. Lay belts to carry them into crates of the matching colour."],
  ["Building", "Pick a tile from the tray and tap the floor to place it. Tap the same kind of tile again to turn it. Long-press a sorter or paint booth to change its colour."],
  ["Sorters", "A sorter sends parts of its own colour off to one side, and lets all others carry straight on. The arrow shows the straight direction."],
  ["Paint", "A paint booth turns every part into its own colour. Some factories need one."],
  ["Stars", "Press Run to test your line. One part on the floor or in the wrong crate stops it. Use as few tiles as you can for three stars."],
];

function art(c, g, t) {
  backdrop(c, g, t);
  for (let i = 0; i < 3; i++) {
    const x = 130 + i * 66, y = 340 + (i % 2) * 30;
    gear(c, x, y, 40, t * (i % 2 ? -0.8 : 0.8), "#f59e0b");
  }
}

function gear(c, x, y, r, a, color) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.fillStyle = color;
  for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.fillRect(-r * 0.16, -r * 1.12, r * 0.32, r * 0.4); }
  c.restore();
  dot(c, x, y, r * 0.8, color);
  dot(c, x, y, r * 0.3, "#0e1116");
}

const title = () => new Title(game, { tag: "Every part in its crate", art, help: HELP, play: () => game.go(levels()) });
const levels = () => new LevelSelect(game, {
  title: "Factories",
  count: LEVELS,
  unlocked: (i) => i === 0 || (data.stars[i - 1] || 0) > 0,
  stars: (i) => data.stars[i] || 0,
  pick: (i) => game.go(new Floor(game, i)),
  back: () => game.go(title()),
});

function arrow(c, x, y, dir, color, size = 11) {
  c.save();
  c.translate(x, y);
  c.rotate((dir * Math.PI) / 2);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, -size);
  c.lineTo(size * 0.8, size * 0.6);
  c.lineTo(0, size * 0.2);
  c.lineTo(-size * 0.8, size * 0.6);
  c.closePath();
  c.fill();
  c.restore();
}

class Floor extends Scene {
  constructor(g, index) { super(g); this.index = index; }
  get y0() { return 62 + Math.max(0, (this.g.H - 640) / 3); }
  enter() {
    this.lv = makeLevel(this.index);
    this.bench = new Bench(this.lv);
    this.tool = "belt";
    this.run = null;
    this.clock = 0;
    this.g.sound.music(compose(this.index + 41, 88, 110));
    this.layout();
  }
  layout() {
    const g = this.g, ui = this.ui, y = g.H - 112, b = this.bench;
    ui.clear();
    ui.button(10, 10, 62, 34, "Menu", () => { g.sound.stopMusic(); g.go(levels()); }, { size: 13 });
    ui.button(g.W - 72, 10, 62, 34, "Clear", () => { this.stop(); b.tiles.clear(); this.layout(); }, { size: 13 });
    const tools = TOOLS.filter(([id]) => id === "erase" || id === "belt" || this.lv.stock[id] > 0);
    const w = (g.W - 20) / tools.length;
    tools.forEach(([id, name], i) => {
      const n = id === "erase" ? "" : `${b.left(id)} left`;
      ui.button(10 + i * w, y, w - 5, 54, name, () => { this.tool = id; this.layout(); }, { sub: n, size: 12, stroke: this.tool === id ? "#fff" : undefined, style: this.tool === id ? "primary" : "ghost" });
    });
    ui.button(10, g.H - 52, g.W - 20, 44, this.run ? "Stop" : "Run the line", () => { if (this.run) this.stop(); else this.start(); }, { style: "primary", size: 17 });
  }
  stop() { this.run = null; this.note = ""; this.layout(); }
  start() {
    this.run = this.bench.factory();
    this.clock = 0;
    this.note = "";
    this.g.sound.play("power");
    this.layout();
  }
  cell(p) {
    const c = Math.floor((p.x - X0) / CELL), r = Math.floor((p.y - this.y0) / CELL);
    return c >= 0 && c < COLS && r >= 0 && r < ROWS ? [c, r] : null;
  }
  down(p) { this.pressAt = this.t; this.pressCell = this.cell(p); }
  up(p) {
    const at = this.cell(p);
    if (!at || this.run) return;
    const [c, r] = at, b = this.bench;
    const held = this.t - this.pressAt > 0.4;
    const here = b.tiles.get(key(c, r));
    if (held && here) { if (b.recolor(c, r)) this.g.sound.play("ok"); return; }
    if (this.tool === "erase") b.remove(c, r);
    else if (!b.place(this.tool, c, r, here?.dir ?? this.lastDir ?? 2)) this.g.sound.play("bad");
    this.lastDir = b.tiles.get(key(c, r))?.dir ?? this.lastDir;
    this.layout();
  }
  update(dt) {
    const f = this.run;
    if (!f || f.state !== "running") return;
    this.clock += dt * 7;
    if (this.clock < 1) return;
    this.clock = 0;
    const had = f.got.reduce((a, b) => a + b);
    f.step();
    if (f.got.reduce((a, b) => a + b) > had) this.g.sound.play("coin");
    if (f.state === "failed") {
      this.note = f.why;
      this.g.sound.play("bad");
      this.g.buzz(60);
      this.run = null;
      this.layout();
    }
    if (f.state === "done") this.win();
  }
  win() {
    const g = this.g, i = this.index, stars = this.bench.stars();
    g.sound.stopMusic();
    if (stars > (data.stars[i] || 0)) { data.stars[i] = stars; g.store.save(); }
    const buttons = [];
    if (i + 1 < LEVELS) buttons.push(["Next factory", () => g.go(new Floor(g, i + 1)), "primary"]);
    buttons.push(["Improve it", () => g.go(new Floor(g, i))], ["Factories", () => g.go(levels())]);
    g.go(new Result(g, { title: "Shift complete", stars, lines: [`Factory ${i + 1}`, `${this.bench.used()} tiles used`, `Three stars at ${this.lv.par} tiles`], buttons }));
  }
  tile(c, t, x, y) {
    const g = this.g;
    panel(c, x + 2, y + 2, CELL - 4, CELL - 4, t.type === "belt" ? "#3f4a5c" : "#1f2937", 7, t.type === "belt" ? null : COLORS[t.color]);
    arrow(c, x + CELL / 2, y + CELL / 2, t.dir, t.type === "belt" ? "#cbd5e1" : COLORS[t.color]);
    if (t.type === "sortL" || t.type === "sortR") {
      const side = t.type === "sortL" ? (t.dir + 3) % 4 : (t.dir + 1) % 4;
      dot(c, x + CELL / 2 + DIRS[side][0] * 17, y + CELL / 2 + DIRS[side][1] * 17, 5, COLORS[t.color]);
    }
    if (t.type === "paint") dot(c, x + 12, y + 12, 5, COLORS[t.color]);
    void g;
  }
  draw(c) {
    const g = this.g, lv = this.lv, y0 = this.y0;
    c.fillStyle = g.theme.bg;
    c.fillRect(0, 0, g.W, g.H);
    text(c, `Factory ${this.index + 1}`, g.W / 2, 27, { size: 17, weight: 800 });
    const got = this.run?.got;
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) panel(c, X0 + col * CELL + 1, y0 + r * CELL + 1, CELL - 2, CELL - 2, "rgba(255,255,255,.04)", 6);
    for (const [col, r] of lv.rocks) panel(c, X0 + col * CELL + 3, y0 + r * CELL + 3, CELL - 6, CELL - 6, "#475569", 8);
    for (const [k, t] of this.bench.tiles) { const [col, r] = k.split(",").map(Number); this.tile(c, t, X0 + col * CELL, y0 + r * CELL); }
    const s = lv.source;
    panel(c, X0 + s.c * CELL + 3, y0 + s.r * CELL + 3, CELL - 6, CELL - 6, "#0f766e", 8);
    arrow(c, X0 + s.c * CELL + 25, y0 + s.r * CELL + 25, s.dir, "#fff");
    lv.feed.forEach((f, i) => dot(c, X0 + s.c * CELL + 12 + i * 12, y0 + s.r * CELL + 11, 4, COLORS[f]));
    lv.crates.forEach((k, i) => {
      const x = X0 + k.c * CELL, y = y0 + k.r * CELL;
      panel(c, x + 3, y + 3, CELL - 6, CELL - 6, COLORS[k.color], 6, "#fff");
      text(c, `${got ? got[i] : 0}/${k.need}`, x + 25, y + 25, { size: 13, weight: 800, color: "#0b0f14" });
    });
    if (this.run) {
      const f = Math.min(1, this.clock);
      for (const it of this.run.items) {
        const x = X0 + (lerp(it.px, it.c, f) + 0.5) * CELL, y = y0 + (lerp(it.py, it.r, f) + 0.5) * CELL;
        dot(c, x, y, 10, "#0b0f14");
        dot(c, x, y, 8, COLORS[it.color]);
      }
    }
    const y = g.H - 126;
    text(c, this.note || `${this.bench.used()} tiles placed. Three stars at ${lv.par}.`, g.W / 2, y, { size: 13, color: this.note ? "#fca5a5" : g.theme.muted, weight: this.note ? 700 : 500 });
  }
}

game.start(title());
