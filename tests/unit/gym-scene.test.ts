// The virtual gym's scene: the layout, guests and their routes, hit testing,
// the words for screen readers, and the pixels it paints. All from a seed.
import { describe, expect, it } from "vitest";
import {
  AGENT_ORDER,
  AGENT_STATIONS,
  agentAt,
  agentPortrait,
  AISLE_Y,
  buildScene,
  Canvas,
  clampGuests,
  COLOR_KEYS,
  COLOR_TOKENS,
  createSim,
  describeScene,
  DOOR,
  drawBackground,
  drawFrame,
  GYM_H,
  GYM_W,
  hashSeed,
  laneFor,
  MAX_GUESTS,
  type Palette,
  packRgba,
  parseColor,
  type Point,
  routeBetween,
  routeOut,
  sceneProps,
  signText,
  SPOTS,
  stepSim,
} from "@/components/agents/gym-scene";

// A palette where every color is different, so pixels can be traced back to a color.
const PAL = Object.fromEntries(COLOR_KEYS.map((k, i) => [k, packRgba(i + 1, 2 * i + 1, 3 * i + 1)])) as Palette;
const keyOf = (px: number) => COLOR_KEYS.find((k) => PAL[k] === px);

function inside(p: Point, [x, y, w, h]: readonly [number, number, number, number]) {
  return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
}

/** Every pixel a route passes through. */
function walk(from: Point, path: Point[]): Point[] {
  const out: Point[] = [];
  let at = { ...from };
  for (const to of path) {
    while (at.x !== to.x || at.y !== to.y) {
      at = { x: at.x + Math.sign(to.x - at.x), y: at.x === to.x ? at.y + Math.sign(to.y - at.y) : at.y };
      out.push(at);
    }
  }
  return out;
}

describe("gym layout", () => {
  const props = sceneProps();

  it("keeps the walkway clear in every lane", () => {
    for (let id = 0; id < 9; id++) {
      const y = laneFor(id);
      expect(Math.abs(y - AISLE_Y)).toBeLessThanOrEqual(4);
      for (let x = 2; x < GYM_W - 2; x++) {
        const blocked = props.filter((p) => p.foot && inside({ x, y }, p.foot)).map((p) => p.id);
        expect(blocked, `lane ${y} at x ${x}`).toEqual([]);
      }
    }
  });

  it("gives every spot a way to the aisle that only crosses its own machine", () => {
    for (const spot of [...SPOTS, { ...DOOR, id: "door" }]) {
      const host = "host" in spot ? spot.host : undefined;
      for (const p of walk(spot, routeOut(spot))) {
        const hit = props.filter((prop) => prop.foot && prop.id !== host && inside(p, prop.foot)).map((prop) => prop.id);
        expect(hit, `${spot.id} at ${p.x},${p.y}`).toEqual([]);
      }
      expect(spot.x).toBeGreaterThanOrEqual(2);
      expect(spot.x).toBeLessThan(GYM_W - 2);
      expect(spot.y).toBeLessThan(GYM_H);
    }
  });

  it("routes only in straight lines, by way of the aisle", () => {
    const a = SPOTS.find((s) => s.id.startsWith("tread"))!;
    const b = SPOTS.find((s) => s.id.startsWith("lift"))!;
    const path = routeBetween(a, b, 66);
    let prev: Point = a;
    for (const p of path) {
      expect(p.x === prev.x || p.y === prev.y).toBe(true);
      prev = p;
    }
    expect(path.at(-1)).toEqual({ x: b.x, y: b.y });
    expect(path.some((p) => p.y === 66)).toBe(true);
    expect(routeBetween(a, a)).toEqual([...routeOut(a), { x: a.x, y: a.y }]);
  });
});

describe("guests", () => {
  it("are the same for the same seed and different for another", () => {
    const run = (seed: number) => {
      const sim = createSim(seed, 18);
      for (let i = 0; i < 400; i++) stepSim(sim);
      return sim.guests.map((g) => [g.x, g.y, g.state, g.spot, g.look.T]);
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it("number what the page asks for, from 0 to 30", () => {
    expect(createSim(1, 0).guests).toHaveLength(0);
    expect(createSim(1, 14).guests).toHaveLength(14);
    expect(createSim(1, 99).guests).toHaveLength(MAX_GUESTS);
    expect(clampGuests(-4)).toBe(0);
    expect(clampGuests(Number.NaN)).toBe(0);
    expect(clampGuests(7.6)).toBe(8);
  });

  it("start at machines, all of them for a still frame", () => {
    const still = createSim(7, 12, 1);
    expect(still.guests.every((g) => g.spot >= 0 && g.x === SPOTS[g.spot].x && g.y === SPOTS[g.spot].y)).toBe(true);
    const busy = createSim(7, MAX_GUESTS, 1);
    expect(busy.guests.filter((g) => g.spot >= 0)).toHaveLength(SPOTS.length);
  });

  it("never share a spot, stay in the room and walk one pixel at a time", () => {
    const sim = createSim(hashSeed("Summit Strength Club"), MAX_GUESTS);
    let sawDoor = false;
    for (let i = 0; i < 3000; i++) {
      const before = sim.guests.map((g) => ({ x: g.x, y: g.y, state: g.state }));
      stepSim(sim);
      const holders = new Map<number, number>();
      sim.guests.forEach((g, n) => {
        if (g.spot >= 0) {
          expect(holders.has(g.spot), `spot ${SPOTS[g.spot].id} held twice`).toBe(false);
          holders.set(g.spot, g.id);
          expect(sim.taken[g.spot]).toBe(g.id);
        }
        if (g.state === "out") sawDoor = true;
        if (g.state === "out" || before[n].state === "out") return;
        expect(g.x).toBeGreaterThanOrEqual(2);
        expect(g.x).toBeLessThan(GYM_W - 2);
        expect(g.y).toBeGreaterThanOrEqual(DOOR.y);
        expect(g.y).toBeLessThan(GYM_H);
        expect(Math.abs(g.x - before[n].x) + Math.abs(g.y - before[n].y)).toBeLessThanOrEqual(1);
      });
      sim.taken.forEach((id, spot) => {
        if (id >= 0) expect(sim.guests[id].spot).toBe(spot);
      });
    }
    expect(sawDoor).toBe(true);
  });
});

describe("agents", () => {
  it("are found where they stand, and nowhere else", () => {
    for (const key of AGENT_ORDER) {
      const s = AGENT_STATIONS[key];
      expect(agentAt(s.x, s.y - 6, AGENT_ORDER)).toBe(key);
      expect(agentAt(s.x, s.y - 6, AGENT_ORDER.filter((k) => k !== key))).toBeNull();
    }
    expect(agentAt(140, 66, AGENT_ORDER)).toBeNull();
    expect(agentAt(-5, -5, AGENT_ORDER)).toBeNull();
  });

  it("have a portrait for the legend", () => {
    for (const key of AGENT_ORDER) {
      const px = agentPortrait(key);
      expect(px.length).toBeGreaterThan(20);
      expect(px.every((p) => p.x >= 0 && p.x < 7 && p.y >= 0 && p.y < 9 && p.c in COLOR_TOKENS)).toBe(true);
    }
  });
});

describe("words", () => {
  it("puts the club's name on the sign in capitals, cut short when long", () => {
    expect(signText("Summit Strength Club")).toBe("SUMMIT STRENGTH CLUB");
    expect(signText("Café Énergie")).toBe("CAFE ENERGIE");
    expect(signText("   ")).toBe("OPEN GYM");
    const long = signText("The Extremely Long Name Strength and Conditioning Club");
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith("..")).toBe(true);
  });

  it("describes the scene for screen readers", () => {
    const agents = [
      { key: "frontdesk" as const, name: "Front desk", waiting: 3 },
      { key: "coach" as const, name: "Coach", waiting: 0 },
      { key: "marketing" as const, name: "Marketing", waiting: 1 },
    ];
    expect(describeScene("SUMMIT STRENGTH CLUB", "busy", 14, agents)).toBe(
      "Summit Strength Club, busy: 14 guests on the floor. Front desk has 3 things waiting. Marketing has 1 thing waiting.",
    );
    expect(describeScene("Iron & Oak", "quiet", 0, [{ key: "coach", name: "Coach", waiting: 0 }])).toBe(
      "Iron & Oak, quiet: no one on the floor yet. Nothing is waiting on the team.",
    );
    expect(describeScene("Summit", "steady", 1, [])).toBe("Summit, steady: 1 guest on the floor.");
    expect(describeScene("Summit", "packed", 30, agents)).not.toContain("—");
  });
});

describe("painting", () => {
  it("reads token colors", () => {
    expect(parseColor("#ff7a1a")).toBe(packRgba(255, 122, 26));
    expect(parseColor(" #fff ")).toBe(packRgba(255, 255, 255));
    expect(parseColor("rgb(12 34 56)")).toBe(packRgba(12, 34, 56));
    expect(parseColor("rgba(12, 34, 56, 0.5)")).toBe(packRgba(12, 34, 56));
    expect(parseColor("oklch(0.7 0.1 40)")).toBeNull();
  });

  function paint(guests: number, opts: Partial<Parameters<typeof drawFrame>[4]> = {}) {
    const scene = buildScene("Summit Strength Club");
    const c = new Canvas(PAL);
    drawBackground(c, scene);
    const bg = c.px.slice();
    const sim = createSim(hashSeed("Summit Strength Club"), guests, 1);
    drawFrame(c, bg, scene, sim, { tick: 0, mood: "busy", guests, agents: [], selected: null, hovered: null, ...opts });
    return { c, scene, sim };
  }
  const count = (px: Uint32Array, key: keyof Palette, x0 = 0, y0 = 0, x1 = GYM_W, y1 = GYM_H) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (px[y * GYM_W + x] === PAL[key]) n++;
    return n;
  };

  it("fills every pixel from the palette, or a shadow of it", () => {
    const { c } = paint(24, { agents: AGENT_ORDER.map((key) => ({ key, waiting: 2 })), selected: "coach" });
    const darker = (px: number, f: number) => packRgba(((px & 255) * f) | 0, (((px >>> 8) & 255) * f) | 0, (((px >>> 16) & 255) * f) | 0);
    const known = new Set<number>(Object.values(PAL));
    for (let i = 0; i < 2; i++) for (const px of [...known]) for (const f of [0.5, 0.55]) known.add(darker(px, f));
    expect(Array.from(c.px).filter((px) => !known.has(px))).toEqual([]);
    expect(Array.from(c.px).filter((px) => keyOf(px)).length).toBeGreaterThan(GYM_W * GYM_H * 0.95);
  });

  it("lights the club's name in neon over the door", () => {
    const { c, scene } = paint(0);
    expect(count(c.px, "neon", scene.signX, 2, GYM_W - scene.signX, 12)).toBeGreaterThan(100);
  });

  it("shows the mood on the wall screen, or quiet today when no one is in", () => {
    const busy = paint(14).c.px;
    const quiet = paint(0).c.px;
    // Busy draws the word in neon; quiet today is plain orange text.
    expect(count(busy, "neon", 10, 12, 41, 19)).toBeGreaterThan(10);
    expect(count(quiet, "neon", 10, 12, 41, 26)).toBe(0);
    expect(count(quiet, "orange", 10, 12, 41, 26)).toBeGreaterThan(40);
  });

  it("draws guests only when there are some", () => {
    const empty = paint(0).c.px;
    const full = paint(30).c.px;
    const skin = (px: Uint32Array) => count(px, "skin1") + count(px, "skin2") + count(px, "skin3");
    // The agents are not drawn here, so any skin at all is a guest.
    expect(skin(empty)).toBe(0);
    expect(skin(full)).toBeGreaterThan(30 * 4);
  });

  it("draws only the agents it is given, with a bubble when something is waiting", () => {
    const fd = AGENT_STATIONS.frontdesk;
    const none = paint(0).c.px;
    const one = paint(0, { agents: [{ key: "frontdesk", waiting: 0 }] }).c.px;
    const waiting = paint(0, { agents: [{ key: "frontdesk", waiting: 4 }] }).c.px;
    const area = [fd.x - 4, fd.y - 11, fd.x + 4, fd.y - 2] as const;
    expect(count(none, "skin2", ...area)).toBe(0);
    expect(count(one, "skin2", ...area)).toBeGreaterThan(5);
    const bubble = [fd.x - 6, fd.y - 25, fd.x + 7, fd.y - 12] as const;
    expect(count(one, "paper", ...bubble)).toBe(0);
    expect(count(waiting, "paper", ...bubble)).toBeGreaterThan(20);
  });

  it("rings the selected agent", () => {
    const s = AGENT_STATIONS.coach;
    const area = [s.x - 5, s.y - 13, s.x + 6, s.y + 3] as const;
    const plain = paint(0, { agents: [{ key: "coach", waiting: 0 }] }).c.px;
    const picked = paint(0, { agents: [{ key: "coach", waiting: 0 }], selected: "coach" }).c.px;
    expect(count(picked, "neon", ...area)).toBeGreaterThan(count(plain, "neon", ...area) + 15);
  });
});
