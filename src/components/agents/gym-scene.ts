// The virtual gym's scene, worked out without the DOM: the room layout, the
// sprite bitmaps, where guests stand and how they walk, and a rasterizer that
// paints a frame into a 192 x 108 pixel buffer. Everything follows from a seed,
// so the same club always gets the same gym and the tests can replay it.

export const GYM_W = 192;
export const GYM_H = 108;
export const MAX_GUESTS = 30;
/** The walkway across the middle of the floor. Every route runs along it. */
export const AISLE_Y = 68;

export type AgentKey = "frontdesk" | "memberships" | "marketing" | "coach";
export type Mood = "quiet" | "steady" | "busy" | "packed";
export type Point = { x: number; y: number };

// ── Colors ──────────────────────────────────────────────────────────────────

/** Every color the gym uses, and the token in tokens.css it comes from. */
export const COLOR_TOKENS = {
  void: "--bo-pixel-void",
  ink: "--bo-pixel-ink",
  wall: "--bo-pixel-wall",
  wall2: "--bo-pixel-wall-2",
  wall3: "--bo-pixel-wall-3",
  floor: "--bo-pixel-floor",
  floor2: "--bo-pixel-floor-2",
  floor3: "--bo-pixel-floor-3",
  orange: "--bo-pixel-orange",
  orange2: "--bo-pixel-orange-2",
  orange3: "--bo-pixel-orange-3",
  neon: "--bo-pixel-neon",
  steel: "--bo-pixel-steel",
  steel2: "--bo-pixel-steel-2",
  iron: "--bo-pixel-iron",
  glass: "--bo-pixel-glass",
  glass2: "--bo-pixel-glass-2",
  screen: "--bo-pixel-screen",
  paper: "--bo-pixel-paper",
  plant: "--bo-pixel-plant",
  plant2: "--bo-pixel-plant-2",
  skin1: "--bo-pixel-skin-1",
  skin2: "--bo-pixel-skin-2",
  skin3: "--bo-pixel-skin-3",
  hair1: "--bo-pixel-hair-1",
  hair2: "--bo-pixel-hair-2",
  hair3: "--bo-pixel-hair-3",
  hair4: "--bo-pixel-hair-4",
  shirt1: "--bo-pixel-shirt-1",
  shirt2: "--bo-pixel-shirt-2",
  shirt3: "--bo-pixel-shirt-3",
  shirt4: "--bo-pixel-shirt-4",
  shirt5: "--bo-pixel-shirt-5",
  shorts1: "--bo-pixel-shorts-1",
  shorts2: "--bo-pixel-shorts-2",
  shorts3: "--bo-pixel-shorts-3",
} as const;

export type ColorKey = keyof typeof COLOR_TOKENS;
export const COLOR_KEYS = Object.keys(COLOR_TOKENS) as ColorKey[];
/** Packed pixels, one 32-bit number per color, in the byte order ImageData uses (RGBA in memory). */
export type Palette = Record<ColorKey, number>;

export function packRgba(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Reads "#rgb", "#rrggbb" or "rgb(r g b)" / "rgb(r, g, b)". Anything else is null. */
export function parseColor(value: string): number | null {
  const v = value.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return packRgba(r, g, b);
  }
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return packRgba((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v);
  if (m) return packRgba(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function shade(px: number, f: number): number {
  const r = (px & 255) * f;
  const g = ((px >>> 8) & 255) * f;
  const b = ((px >>> 16) & 255) * f;
  return packRgba(r | 0, g | 0, b | 0);
}

// ── Seeded randomness ───────────────────────────────────────────────────────

export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: returns the next state and a number in [0, 1). */
function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    const [n, v] = nextRandom(s);
    s = n;
    return v;
  };
}

// ── Pixel font (3 x 5) ──────────────────────────────────────────────────────

const GLYPHS: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001110",
  " ": "000000000000000", ".": "000000000000010", "!": "010010010000010", "+": "000010111010000",
  "-": "000000111000000", "&": "010101010101011", "'": "010010000000000", ":": "000010000010000",
  "/": "001001010100100", "?": "110001010000010", ",": "000000000010100",
};

export function textWidth(text: string, advance = 4): number {
  return text.length === 0 ? 0 : text.length * advance - (advance - 3);
}
/** The sign spaces its letters a little wider so the glow doesn't run them together. */
const SIGN_ADVANCE = 5;

/** The club's name as the sign shows it: capitals, only characters the pixel font has, cut short if long. */
export const SIGN_MAX = 30;
export function signText(club: string): string {
  const clean = club
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 .!+\-&':/?,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "OPEN GYM";
  if (clean.length <= SIGN_MAX) return clean;
  return `${clean.slice(0, SIGN_MAX - 2).trimEnd()}..`;
}

// ── Sprites ─────────────────────────────────────────────────────────────────
// One character per pixel. "." is clear. Capitals H (hair), S (skin), T (top)
// and B (bottoms) take the wearer's colors. "@" means "the head goes here".

const FIXED: Record<string, ColorKey> = {
  k: "ink", w: "paper", O: "orange", o: "orange2", r: "orange3", n: "neon", g: "steel", G: "steel2", i: "iron",
};

export type Look = { H: ColorKey; S: ColorKey; T: ColorKey; B: ColorKey };
export type Sprite = { rows: readonly string[]; ax: number; ay: number };

const HEADS_FRONT = [
  [".HHH.", ".SSS.", ".SSS."],
  [".HHH.", "HSSSH", "HSSSH"],
  [".HHHH", ".SSSH", ".SSS."],
  ["HHHH.", ".SSS.", ".SSS."],
] as const;
const HEADS_BACK = [
  [".HHH.", ".HHH.", ".HHH."],
  [".HHH.", "HHHHH", "HHHHH"],
  [".HHHH", ".HHHH", ".HHH."],
  [".HHHH", ".HHH.", ".HHH."],
] as const;

const HEAD = ["@@@@@", "@@@@@", "@@@@@"];
/** Body poses, two frames each. Nine rows, five wide, feet on the last row. */
const POSES = {
  stand: [
    [...HEAD, "TTTTT", "STTTS", ".TTT.", ".BBB.", ".S.S.", ".k.k."],
    [...HEAD, "TTTTT", "STTTS", ".TTT.", ".BBB.", ".S.S.", ".k.k."],
  ],
  walk: [
    [...HEAD, "TTTTT", "STTTS", ".TTT.", ".BBB.", ".S.S.", "k...k"],
    [...HEAD, "TTTTT", "STTTS", ".TTT.", ".BBB.", "..S..", "..k.."],
  ],
  jack: [
    [...HEAD, "TTTTT", "STTTS", ".TTT.", ".BBB.", ".S.S.", ".k.k."],
    ["S@@@S", "S@@@S", "@@@@@", "TTTTT", ".TTT.", ".TTT.", ".BBB.", "S...S", "k...k"],
  ],
  lift: [
    [...HEAD, "TTTTT", "STTTS", "iTTTi", ".BBB.", ".S.S.", ".k.k."],
    ["@@@@@", "i@@@i", "S@@@S", "TTTTT", ".TTT.", ".TTT.", ".BBB.", ".S.S.", ".k.k."],
  ],
  stretch: [
    [...HEAD, "TTTTT", "STTTS", ".TTT.", ".BBB.", ".S.S.", ".k.k."],
    [".S@@@", "S@@@@", "@@@@@", "TTTTT", ".TTTS", ".TTT.", ".BBB.", ".S.S.", ".k.k."],
  ],
} satisfies Record<string, string[][]>;

/** Riding a bike, seen from the side, facing right. */
const BIKE_RIDER = [
  [".HHH...", ".HSS...", ".HSS...", "TTTT...", "TTTTSS.", ".TTT...", ".BBBB..", "...BS..", "...S...", "...kk.."],
  [".HHH...", ".HSS...", ".HSS...", "TTTT...", "TTTTSS.", ".TTT...", ".BBB...", "..BS...", "..S....", "..kk..."],
];

/** A back squat, with the bar across the shoulders. */
const SQUAT = [
  [
    ".......@@@@@.......",
    ".......@@@@@.......",
    "ooi....@@@@@....ioo",
    "ooiggggGGGGGggggioo",
    "ooi...STTTTTS...ioo",
    ".......TTTTT.......",
    "........BBB........",
    "........S.S........",
    "........k.k........",
  ],
  [
    "...................",
    ".......@@@@@.......",
    ".......@@@@@.......",
    "ooi....@@@@@....ioo",
    "ooiggggGGGGGggggioo",
    "ooi...STTTTTS...ioo",
    ".......TTTTT.......",
    ".......BB.BB.......",
    ".......kk.kk.......",
  ],
];

/** Staff. Seven wide, twelve tall. */
const AGENT_BODY = ["TTTTTTT", "TTTTTwT", "STTTTTS", "S.TTT.S", "..BBB..", "..B.B..", "..k.k.."];
const AGENT_HEADS: Record<AgentKey, string[]> = {
  frontdesk: ["..HHH..", ".kHHHk.", ".kSSSk.", ".SkSkS.", "..SSk.."],
  memberships: ["..HHH..", ".HHHHH.", ".HSSSH.", ".HkSkH.", "H.SSS.H"],
  marketing: ["..HHH..", ".HHHHH.", ".SSSSS.", ".kkSkk.", "..SSS.."],
  coach: ["..ooo..", ".ooooo.", ".SSSSoo", ".SkSkS.", "..SSS.."],
};
const AGENT_BODIES: Record<AgentKey, string[][]> = {
  frontdesk: [AGENT_BODY, AGENT_BODY],
  memberships: [
    ["TTTTTTT", "TTwwwwT", "STwkwwS", "S.wwk.S", "..BBB..", "..B.B..", "..k.k.."],
    ["TTTTTTT", "TTwwwwT", "STwwkwS", "S.wkw.S", "..BBB..", "..B.B..", "..k.k.."],
  ],
  marketing: [AGENT_BODY, ["TTTTTTT", "TTTTTwT", "STTTTTS", "STTTT.S", "..BBB..", "..B.B..", "..k.k.."]],
  coach: [
    ["TTTTTTT", "TTGTTTT", "STTTTTS", "S.TTT.S", "..BBB..", "..S.S..", "..O.O.."],
    ["TTTTTTT", "TTGTTTT", ".STTTS.", "..SSS..", "..BBB..", "..S.S..", "..O.O.."],
  ],
};
export const AGENT_LOOKS: Record<AgentKey, Look> = {
  frontdesk: { H: "hair1", S: "skin2", T: "orange", B: "shorts1" },
  memberships: { H: "hair2", S: "skin1", T: "orange", B: "shorts1" },
  marketing: { H: "hair3", S: "skin3", T: "orange", B: "shorts1" },
  coach: { H: "hair1", S: "skin2", T: "iron", B: "ink" },
};

/** An agent's head and shoulders as colored pixels, for the little portraits in the legend. */
export function agentPortrait(key: AgentKey): { x: number; y: number; c: ColorKey }[] {
  const rows = agentSprite(key, 0).rows.slice(0, 9);
  const look = AGENT_LOOKS[key] as Record<string, ColorKey>;
  const out: { x: number; y: number; c: ColorKey }[] = [];
  rows.forEach((row, y) =>
    row.split("").forEach((ch, x) => {
      const c = look[ch] ?? FIXED[ch];
      if (c) out.push({ x, y, c });
    }),
  );
  return out;
}

function agentSprite(key: AgentKey, frame: number): Sprite {
  return { rows: [...AGENT_HEADS[key], ...AGENT_BODIES[key][frame & 1]], ax: 3, ay: 11 };
}

function withHead(rows: readonly string[], head: readonly string[], dx = 0): string[] {
  return rows.map((row, y) =>
    row
      .split("")
      .map((c, x) => {
        if (c !== "@") return c;
        const h = head[y - rows.findIndex((r) => r.includes("@"))]?.[x - dx];
        return h ?? ".";
      })
      .join(""),
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

export type Rect = readonly [x: number, y: number, w: number, h: number, c: ColorKey];
/** A thing on the floor. `z` is where it touches the floor, so nearer things draw later. */
export type Prop = { id: string; z: number; rects: Rect[]; foot?: readonly [number, number, number, number]; label?: { text: string; x: number; y: number; c: ColorKey } };

export type Pose = "stand" | "run" | "bike" | "jack" | "lift" | "squat" | "desk" | "stretch";
export type Spot = {
  id: string;
  x: number;
  y: number;
  pose: Pose;
  /** The prop this spot is on. Its footprint is fine to cross. */
  host?: string;
  /** Turns between the spot and the aisle, nearest the spot first. */
  via?: Point[];
  /** Draw order when someone uses the spot, if not their feet. */
  z?: number;
};

const TREADMILLS = [46, 57, 68];
const MATS = [44, 53, 62, 71];
const BIKES = [6, 19, 32];

function treadmill(x: number): Prop {
  return {
    id: `tread-${x}`,
    z: 45,
    foot: [x, 36, 9, 9],
    rects: [
      [x, 27, 1, 10, "steel"],
      [x + 8, 27, 1, 10, "steel"],
      [x, 25, 9, 3, "iron"],
      [x + 1, 25, 7, 1, "steel"],
      [x + 2, 26, 5, 1, "orange"],
      [x, 36, 9, 9, "iron"],
      [x + 1, 36, 7, 8, "ink"],
      [x, 44, 9, 1, "orange2"],
    ],
  };
}

function bike(x: number): Prop {
  return {
    id: `bike-${x}`,
    z: 92,
    foot: [x, 84, 10, 9],
    rects: [
      [x, 91, 4, 1, "iron"],
      [x + 6, 91, 4, 1, "iron"],
      [x + 2, 85, 1, 6, "iron"],
      [x + 1, 84, 3, 1, "ink"],
      [x + 3, 88, 3, 1, "iron"],
      [x + 7, 84, 2, 1, "steel"],
      [x + 6, 85, 4, 4, "steel"],
      [x + 7, 89, 2, 1, "steel"],
      [x + 7, 86, 2, 2, "orange2"],
      [x + 8, 79, 1, 6, "iron"],
      [x + 7, 79, 3, 1, "ink"],
      [x + 9, 80, 1, 1, "orange"],
    ],
  };
}

const PROPS: Prop[] = [
  ...TREADMILLS.map(treadmill),
  // Front counter, beside the door
  {
    id: "counter",
    z: 43,
    foot: [106, 33, 32, 10],
    rects: [
      [126, 27, 7, 5, "iron"],
      [127, 28, 5, 3, "steel"],
      [128, 32, 3, 1, "iron"],
      [110, 32, 3, 1, "orange"],
      [111, 31, 1, 1, "orange"],
      [106, 33, 32, 2, "steel2"],
      [106, 35, 32, 8, "iron"],
      [106, 35, 32, 1, "orange"],
      [106, 38, 32, 1, "orange2"],
      [106, 42, 32, 1, "ink"],
    ],
  },
  // Membership desk, with JOIN on the front
  {
    id: "membership",
    z: 59,
    foot: [6, 50, 32, 9],
    rects: [
      [30, 46, 5, 4, "paper"],
      [31, 47, 3, 1, "orange2"],
      [9, 48, 6, 2, "orange"],
      [6, 50, 32, 2, "steel2"],
      [6, 52, 32, 7, "iron"],
      [6, 52, 32, 1, "orange2"],
      [6, 58, 32, 1, "ink"],
    ],
    label: { text: "JOIN", x: 15, y: 53, c: "orange" },
  },
  // Marketing desk, under the board
  {
    id: "marketing",
    z: 53,
    foot: [150, 44, 32, 9],
    rects: [
      [153, 39, 9, 5, "steel"],
      [153, 39, 9, 1, "steel2"],
      [157, 41, 1, 1, "orange"],
      [172, 41, 3, 3, "paper"],
      [175, 42, 1, 1, "paper"],
      [173, 41, 1, 1, "orange2"],
      [150, 44, 32, 2, "steel2"],
      [150, 46, 32, 7, "iron"],
      [150, 46, 32, 1, "orange2"],
      [150, 52, 32, 1, "ink"],
    ],
  },
  ...BIKES.map(bike),
  // Dumbbell rack
  {
    id: "dumbbells",
    z: 86,
    foot: [98, 77, 32, 9],
    rects: [
      [98, 77, 1, 9, "steel"],
      [129, 77, 1, 9, "steel"],
      [98, 79, 32, 1, "steel"],
      [98, 83, 32, 1, "steel"],
      ...[0, 1, 2, 3, 4, 5, 6].flatMap((i): Rect[] => [
        [100 + i * 4, 77, 3, 2, i % 3 === 0 ? "orange2" : "iron"],
        [100 + i * 4, 81, 3, 2, i % 2 ? "orange2" : "iron"],
      ]),
      [98, 85, 32, 1, "ink"],
    ],
  },
  // Squat rack: the back posts, then the front posts so a lifter stands inside it
  {
    id: "rack",
    z: 96,
    foot: [146, 73, 28, 28],
    rects: [
      [148, 70, 1, 26, "steel"],
      [171, 70, 1, 26, "steel"],
      [148, 70, 24, 1, "steel"],
      [149, 82, 1, 2, "orange"],
      [170, 82, 1, 2, "orange"],
    ],
  },
  {
    id: "rack-front",
    z: 101,
    rects: [
      [146, 74, 1, 27, "steel2"],
      [173, 74, 1, 27, "steel2"],
      [146, 74, 28, 1, "steel2"],
      [147, 74, 2, 1, "steel2"],
      [146, 86, 2, 1, "orange"],
      [172, 86, 2, 1, "orange"],
      [145, 100, 3, 1, "iron"],
      [172, 100, 3, 1, "iron"],
      [147, 71, 1, 4, "steel2"],
      [172, 71, 1, 4, "steel2"],
    ],
  },
  // Plate tree
  {
    id: "plates",
    z: 97,
    foot: [179, 84, 9, 13],
    rects: [
      [183, 82, 1, 14, "steel"],
      [180, 96, 7, 1, "iron"],
      [180, 84, 7, 5, "iron"],
      [181, 85, 5, 3, "orange2"],
      [182, 86, 3, 1, "iron"],
      [181, 90, 5, 5, "iron"],
      [182, 91, 3, 3, "ink"],
    ],
  },
  // Plants in the back corners
  {
    id: "plant-left",
    z: 46,
    foot: [0, 40, 6, 6],
    rects: [
      [1, 33, 2, 3, "plant"],
      [3, 31, 2, 4, "plant2"],
      [0, 35, 5, 3, "plant"],
      [2, 34, 1, 1, "plant2"],
      [4, 36, 2, 2, "plant2"],
      [1, 40, 5, 6, "orange3"],
      [1, 40, 5, 1, "orange2"],
    ],
  },
  {
    id: "plant-right",
    z: 40,
    foot: [185, 34, 6, 6],
    rects: [
      [186, 26, 2, 4, "plant"],
      [188, 28, 2, 3, "plant2"],
      [185, 29, 5, 3, "plant"],
      [187, 31, 2, 2, "plant2"],
      [185, 34, 6, 6, "orange3"],
      [185, 34, 6, 1, "orange2"],
    ],
  },
];

export function sceneProps(): readonly Prop[] {
  return PROPS;
}

/** Where the four agents work. x is their middle, y their feet. */
export const AGENT_STATIONS: Record<AgentKey, Point> = {
  frontdesk: { x: 120, y: 35 },
  memberships: { x: 21, y: 52 },
  marketing: { x: 167, y: 46 },
  coach: { x: 89, y: 93 },
};
export const AGENT_ORDER: AgentKey[] = ["frontdesk", "memberships", "marketing", "coach"];

const LIFT_VIA: Point[] = [{ x: 96, y: 95 }];
export const SPOTS: Spot[] = [
  ...TREADMILLS.map((x): Spot => ({ id: `tread-${x}`, x: x + 4, y: 41, pose: "run", host: `tread-${x}`, z: 45.5 })),
  ...BIKES.map((x): Spot => ({ id: `bike-${x}`, x: x + 3, y: 88, pose: "bike", host: `bike-${x}`, z: 92.5 })),
  ...MATS.map((x, i): Spot => ({ id: `mat-${i + 1}`, x: x + 4, y: 94, pose: "jack" })),
  ...[104, 114, 124].map((x): Spot => ({ id: `lift-${x}`, x, y: 95, pose: "lift", via: LIFT_VIA })),
  { id: "squat", x: 160, y: 96, pose: "squat", host: "rack", z: 98 },
  { id: "counter-1", x: 113, y: 48, pose: "desk" },
  { id: "counter-2", x: 128, y: 48, pose: "desk" },
  { id: "join", x: 34, y: 63, pose: "desk" },
  { id: "floor-1", x: 48, y: 58, pose: "stretch" },
  { id: "floor-2", x: 60, y: 56, pose: "stretch" },
  { id: "floor-3", x: 74, y: 59, pose: "jack" },
  { id: "floor-4", x: 140, y: 60, pose: "stretch" },
  { id: "floor-5", x: 182, y: 62, pose: "stretch" },
  { id: "floor-6", x: 136, y: 80, pose: "stretch" },
  { id: "floor-7", x: 46, y: 76, pose: "stretch" },
  { id: "floor-8", x: 139, y: 101, pose: "stand" },
];
// Pacing spots are made up as needed and have negative ids; the door is its own place.
export const DOOR: Point = { x: 96, y: 34 };
export const DOOR_SPOT = -2;
export const PACING = -1;

/** The turns from a spot out to the aisle, ending on the aisle. */
export function routeOut(spot: Point & { via?: Point[] }, aisle = AISLE_Y): Point[] {
  const via = spot.via ?? [];
  const last = via.length ? via[via.length - 1] : spot;
  return [...via, { x: last.x, y: aisle }];
}

/** Each guest keeps to a lane a few pixels either side of the aisle, so walkers don't line up. */
export function laneFor(id: number): number {
  return AISLE_Y + ((id * 5) % 9) - 4;
}

/** An axis-aligned route between two places, by way of the aisle. */
export function routeBetween(from: Point & { via?: Point[] }, to: Point & { via?: Point[] }, aisle = AISLE_Y): Point[] {
  const out = routeOut(from, aisle);
  const into = routeOut(to, aisle).reverse();
  const pts = [...out, ...into, { x: to.x, y: to.y }];
  const path: Point[] = [];
  let prev: Point = from;
  for (const p of pts) {
    if (p.x === prev.x && p.y === prev.y) continue;
    path.push(p);
    prev = p;
  }
  return path;
}

// ── Guests ──────────────────────────────────────────────────────────────────

const SKINS: ColorKey[] = ["skin1", "skin2", "skin3"];
const HAIRS: ColorKey[] = ["hair1", "hair2", "hair3", "hair4"];
const SHIRTS: ColorKey[] = ["shirt1", "shirt2", "shirt3", "shirt4", "shirt5"];
const SHORTS: ColorKey[] = ["shorts1", "shorts2", "shorts3"];

export type Guest = {
  id: number;
  look: Look;
  hair: number;
  x: number;
  y: number;
  path: Point[];
  /** Index into SPOTS, PACING or DOOR_SPOT. */
  spot: number;
  state: "walk" | "work" | "out";
  timer: number;
  phase: number;
};

export type Sim = { rand: number; tick: number; guests: Guest[]; taken: number[] };

function draw(sim: Sim): number {
  const [s, v] = nextRandom(sim.rand);
  sim.rand = s;
  return v;
}
function pick<T>(sim: Sim, list: readonly T[]): T {
  return list[Math.floor(draw(sim) * list.length)];
}
function between(sim: Sim, lo: number, hi: number): number {
  return lo + Math.floor(draw(sim) * (hi - lo + 1));
}

function newLook(sim: Sim): { look: Look; hair: number } {
  return {
    look: { S: pick(sim, SKINS), H: pick(sim, HAIRS), T: pick(sim, SHIRTS), B: pick(sim, SHORTS) },
    hair: between(sim, 0, HEADS_FRONT.length - 1),
  };
}

export function clampGuests(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_GUESTS, Math.round(n))) : 0;
}

function freeSpots(sim: Sim): number[] {
  const out: number[] = [];
  for (let i = 0; i < SPOTS.length; i++) if (sim.taken[i] === -1) out.push(i);
  return out;
}

function workTime(sim: Sim, pose: Pose): number {
  return pose === "desk" ? between(sim, 40, 110) : between(sim, 110, 280);
}

/** Send a guest somewhere new: a free spot, the door now and then, or a short pace along the aisle. */
function sendOff(sim: Sim, g: Guest) {
  if (g.spot >= 0) sim.taken[g.spot] = -1;
  const here = g.spot >= 0 ? SPOTS[g.spot] : { x: g.x, y: g.y };
  const free = freeSpots(sim).filter((i) => i !== g.spot);
  let target: Point & { via?: Point[] };
  if (draw(sim) < 0.07) {
    g.spot = DOOR_SPOT;
    target = DOOR;
  } else if (free.length) {
    g.spot = pick(sim, free);
    sim.taken[g.spot] = g.id;
    target = SPOTS[g.spot];
  } else {
    g.spot = PACING;
    target = { x: between(sim, 12, 180), y: laneFor(g.id) };
  }
  g.path = routeBetween(here, target, laneFor(g.id));
  g.state = "walk";
}

/** A new gym. `settle` is the share of guests already at a machine; a still frame wants them all there. */
export function createSim(seed: number, count: number, settle = 0.75): Sim {
  const n = clampGuests(count);
  const sim: Sim = { rand: seed >>> 0, tick: 0, guests: [], taken: SPOTS.map(() => -1) };
  // Shuffle the spots so each club fills its gym its own way.
  const order = SPOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(draw(sim) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const settled = Math.min(order.length, Math.ceil(n * Math.max(0, Math.min(1, settle))));
  for (let id = 0; id < n; id++) {
    const { look, hair } = newLook(sim);
    const g: Guest = { id, look, hair, x: 0, y: laneFor(id), path: [], spot: PACING, state: "work", timer: 0, phase: between(sim, 0, 7) };
    if (id < settled) {
      g.spot = order[id];
      sim.taken[g.spot] = id;
      g.x = SPOTS[g.spot].x;
      g.y = SPOTS[g.spot].y;
      g.timer = between(sim, 20, 260);
    } else {
      g.x = between(sim, 12, 180);
      g.y = laneFor(id);
      g.timer = between(sim, 0, 20);
    }
    sim.guests.push(g);
  }
  return sim;
}

/** One tick of the gym. Walkers move one pixel; everyone else counts down. */
export function stepSim(sim: Sim): void {
  sim.tick++;
  for (const g of sim.guests) {
    if (g.state === "walk") {
      const to = g.path[0];
      if (to) {
        g.x += Math.sign(to.x - g.x);
        if (g.x === to.x) g.y += Math.sign(to.y - g.y);
        if (g.x === to.x && g.y === to.y) g.path.shift();
      }
      if (g.path.length === 0) {
        if (g.spot === DOOR_SPOT) {
          g.state = "out";
          g.timer = between(sim, 12, 48);
        } else {
          g.state = "work";
          g.timer = g.spot >= 0 ? workTime(sim, SPOTS[g.spot].pose) : between(sim, 8, 30);
        }
      }
    } else if (--g.timer <= 0) {
      if (g.state === "out") {
        // Someone new comes in through the door.
        Object.assign(g, newLook(sim));
        g.x = DOOR.x;
        g.y = DOOR.y;
        g.spot = PACING;
      }
      sendOff(sim, g);
    }
  }
}

// ── Words ───────────────────────────────────────────────────────────────────

export const MOOD_WORD: Record<Mood, string> = { quiet: "QUIET", steady: "STEADY", busy: "BUSY", packed: "PACKED" };
const MOOD_LEVEL: Record<Mood, number> = { quiet: 1, steady: 2, busy: 3, packed: 4 };

function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s\-/&])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

export type AgentInfo = { key: AgentKey; name: string; waiting: number };

/** The scene in words, for the canvas's label. */
export function describeScene(club: string, mood: Mood, guests: number, agents: AgentInfo[]): string {
  const n = clampGuests(guests);
  const name = titleCase(club.trim()) || "The gym";
  const floor = n === 0 ? "no one on the floor yet" : `${n} ${n === 1 ? "guest" : "guests"} on the floor`;
  const parts = [`${name}, ${mood}: ${floor}.`];
  for (const a of agents) {
    const w = Math.max(0, Math.floor(a.waiting));
    if (w > 0) parts.push(`${a.name} has ${w} ${w === 1 ? "thing" : "things"} waiting.`);
  }
  if (agents.length && agents.every((a) => a.waiting <= 0)) parts.push("Nothing is waiting on the team.");
  return parts.join(" ");
}

// ── Hit testing ─────────────────────────────────────────────────────────────

/** The box around an agent that counts as a tap on them, bubble included, with a little slack for fingers. */
export function agentBox(key: AgentKey): { x: number; y: number; w: number; h: number } {
  const s = AGENT_STATIONS[key];
  return { x: s.x - 7, y: s.y - 24, w: 15, h: 28 };
}

export function agentAt(x: number, y: number, keys: readonly AgentKey[]): AgentKey | null {
  let best: AgentKey | null = null;
  let bestD = Infinity;
  for (const k of keys) {
    const b = agentBox(k);
    if (x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) continue;
    const s = AGENT_STATIONS[k];
    const d = Math.abs(x - s.x) + Math.abs(y - (s.y - 6));
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// ── Rasterizing ─────────────────────────────────────────────────────────────

export class Canvas {
  readonly px: Uint32Array;
  constructor(
    readonly pal: Palette,
    px?: Uint32Array,
  ) {
    this.px = px ?? new Uint32Array(GYM_W * GYM_H);
  }
  rect(x: number, y: number, w: number, h: number, c: ColorKey) {
    const color = this.pal[c];
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(GYM_W, x + w);
    const y1 = Math.min(GYM_H, y + h);
    for (let yy = y0; yy < y1; yy++) this.px.fill(color, yy * GYM_W + x0, yy * GYM_W + x1);
  }
  dot(x: number, y: number, c: ColorKey) {
    if (x >= 0 && y >= 0 && x < GYM_W && y < GYM_H) this.px[y * GYM_W + x] = this.pal[c];
  }
  shade(x: number, y: number, w: number, h: number, f: number) {
    for (let yy = Math.max(0, y); yy < Math.min(GYM_H, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(GYM_W, x + w); xx++) this.px[yy * GYM_W + xx] = shade(this.px[yy * GYM_W + xx], f);
  }
  rects(list: readonly Rect[]) {
    for (const [x, y, w, h, c] of list) this.rect(x, y, w, h, c);
  }
  text(text: string, x: number, y: number, c: ColorKey) {
    for (let i = 0; i < text.length; i++) {
      const g = GLYPHS[text[i]] ?? GLYPHS[" "];
      for (let b = 0; b < 15; b++) if (g[b] === "1") this.dot(x + i * 4 + (b % 3), y + Math.floor(b / 3), c);
    }
  }
  /** Draws a sprite with its anchor at (x, y). An outline color rings its silhouette. */
  sprite(s: Sprite, x: number, y: number, look: Look, opts: { flip?: boolean; outline?: ColorKey } = {}) {
    const left = x - (opts.flip ? s.rows[0].length - 1 - s.ax : s.ax);
    const top = y - s.ay;
    const w = s.rows[0].length;
    const colorAt = (cx: number, cy: number): ColorKey | null => {
      const row = s.rows[cy];
      if (!row) return null;
      const ch = row[opts.flip ? w - 1 - cx : cx];
      if (!ch || ch === "." || ch === "@") return null;
      return (look as Record<string, ColorKey>)[ch] ?? FIXED[ch] ?? null;
    };
    if (opts.outline) {
      for (let cy = -1; cy <= s.rows.length; cy++)
        for (let cx = -1; cx <= w; cx++) {
          if (colorAt(cx, cy)) continue;
          if (colorAt(cx - 1, cy) || colorAt(cx + 1, cy) || colorAt(cx, cy - 1) || colorAt(cx, cy + 1)) this.dot(left + cx, top + cy, opts.outline);
        }
    }
    for (let cy = 0; cy < s.rows.length; cy++)
      for (let cx = 0; cx < w; cx++) {
        const c = colorAt(cx, cy);
        if (c) this.dot(left + cx, top + cy, c);
      }
  }
}

export type Scene = { sign: string; signX: number; bars: number[] };

export function buildScene(club: string): Scene {
  const sign = signText(club);
  const rand = makeRandom(hashSeed(club));
  return { sign, signX: Math.round((GYM_W - textWidth(sign, SIGN_ADVANCE)) / 2), bars: Array.from({ length: 7 }, () => 0.35 + rand() * 0.65) };
}

const SIGN_Y = 4;

/** The parts that never move: walls, floor, door, sign plate, wall screen, the board and the mats. */
export function drawBackground(c: Canvas, scene: Scene): void {
  // Wall
  c.rect(0, 0, GYM_W, 32, "wall");
  for (let x = 23; x < GYM_W; x += 24) c.rect(x, 2, 1, 22, "wall3");
  c.rect(0, 0, GYM_W, 2, "wall3");
  c.rect(0, 2, GYM_W, 1, "wall2");
  c.rect(0, 22, GYM_W, 1, "orange3");
  c.rect(0, 23, GYM_W, 2, "orange2");
  c.rect(0, 25, GYM_W, 5, "wall2");
  c.rect(0, 30, GYM_W, 2, "wall3");
  // Floor: planks up front of the wall, rubber tiles where the weights are
  c.rect(0, 32, GYM_W, GYM_H - 32, "floor");
  c.rect(0, 32, GYM_W, 1, "floor3");
  for (let y = 38; y < GYM_H; y += 7) c.rect(0, y, GYM_W, 1, "floor2");
  for (let y = 32; y < GYM_H; y += 7) {
    const off = ((y - 32) / 7) % 2 ? 0 : 13;
    for (let x = off; x < GYM_W; x += 26) c.rect(x, y + 1, 1, 6, "floor2");
  }
  for (let ty = 0; ty < 4; ty++)
    for (let tx = 0; tx < 8; tx++) c.rect(92 + tx * 12, 72 + ty * 9, 12, 9, (tx + ty) % 2 ? "floor3" : "floor");
  c.rect(92, 72, 100, 1, "floor2");
  // Walkway stripe
  for (let x = 2; x < GYM_W; x += 8) c.rect(x, AISLE_Y + 4, 4, 1, "floor2");
  // Mats
  // A turf strip for classes, with a spot marked for each person
  c.rect(43, 82, 41, 19, "orange3");
  c.rect(44, 83, 39, 17, "iron");
  c.rect(44, 83, 39, 1, "wall2");
  for (let x = 45; x < 82; x += 4) c.rect(x, 87, 2, 1, "floor2");
  for (const mx of MATS) {
    c.rect(mx + 2, 95, 5, 1, "orange2");
  }
  c.rect(43, 101, 41, 1, "floor3");
  // Door
  c.rect(87, 12, 18, 20, "steel");
  c.rect(88, 13, 16, 19, "glass");
  c.rect(95, 13, 2, 19, "steel");
  c.rect(89, 14, 2, 4, "glass2");
  c.rect(90, 18, 1, 3, "glass2");
  c.rect(98, 14, 2, 4, "glass2");
  c.rect(93, 21, 1, 3, "orange");
  c.rect(98, 21, 1, 3, "orange");
  c.rect(86, 32, 20, 2, "orange3");
  // Sign plate
  const w = textWidth(scene.sign, SIGN_ADVANCE);
  c.rect(scene.signX - 5, SIGN_Y - 3, w + 10, 11, "ink");
  c.rect(scene.signX - 4, SIGN_Y - 2, w + 8, 9, "void");
  c.rect(scene.signX - 2, SIGN_Y + 8, 1, 3, "steel");
  c.rect(scene.signX + w + 1, SIGN_Y + 8, 1, 3, "steel");
  // Wall screen
  c.rect(8, 9, 35, 19, "ink");
  c.rect(10, 11, 31, 15, "screen");
  c.rect(24, 28, 3, 2, "ink");
  // Bulletin board
  c.rect(148, 9, 34, 21, "iron");
  c.rect(149, 10, 32, 19, "orange3");
  c.rect(151, 12, 8, 10, "paper");
  c.rect(151, 12, 8, 3, "orange");
  c.rect(152, 16, 6, 1, "steel");
  c.rect(152, 18, 4, 1, "steel");
  c.rect(152, 20, 5, 1, "steel");
  c.rect(161, 13, 9, 7, "paper");
  c.rect(162, 18, 1, 1, "orange2");
  c.rect(163, 17, 1, 1, "orange2");
  c.rect(164, 16, 1, 1, "orange2");
  c.rect(165, 16, 1, 1, "orange2");
  c.rect(166, 15, 1, 1, "orange");
  c.rect(167, 14, 1, 1, "orange");
  c.rect(172, 12, 7, 8, "neon");
  c.rect(173, 14, 5, 1, "orange2");
  c.rect(173, 16, 3, 1, "orange2");
  c.rect(161, 22, 7, 5, "paper");
  c.rect(162, 23, 5, 1, "steel");
  c.rect(162, 25, 3, 1, "steel");
  c.rect(170, 22, 9, 5, "orange2");
  c.rect(171, 23, 7, 1, "neon");
  c.dot(155, 12, "ink");
  c.dot(165, 13, "ink");
  c.dot(175, 12, "ink");
  c.dot(164, 22, "ink");
  // Clock
  c.rect(138, 12, 7, 7, "ink");
  c.rect(139, 13, 5, 5, "paper");
  c.rect(141, 14, 1, 2, "ink");
  c.rect(142, 15, 1, 1, "ink");
}

export type FrameView = {
  tick: number;
  mood: Mood;
  guests: number;
  agents: { key: AgentKey; waiting: number }[];
  selected: AgentKey | null;
  hovered: AgentKey | null;
};

type Drawable = { z: number; order: number; draw: () => void };

function guestSprite(g: Guest, tick: number): { sprite: Sprite; flip: boolean } {
  const front = HEADS_FRONT[g.hair];
  const back = HEADS_BACK[g.hair];
  const t = tick + g.phase;
  if (g.state === "walk") {
    const to = g.path[0];
    const up = to && to.y < g.y && to.x === g.x;
    return { sprite: { rows: withHead(POSES.walk[(t >> 1) & 1], up ? back : front), ax: 2, ay: 8 }, flip: !!to && to.x < g.x };
  }
  const pose: Pose = g.spot >= 0 ? SPOTS[g.spot].pose : "stand";
  switch (pose) {
    case "run":
      return { sprite: { rows: withHead(POSES.walk[(t >> 1) & 1], back), ax: 2, ay: 8 }, flip: false };
    case "bike":
      return { sprite: { rows: withHead(BIKE_RIDER[(t >> 1) & 1], front), ax: 3, ay: 9 }, flip: false };
    case "jack":
      // The class on the mats jumps in time with the coach; anyone else keeps their own beat.
      return { sprite: { rows: withHead(POSES.jack[((SPOTS[g.spot].id.startsWith("mat") ? tick : t) >> 2) & 1], front), ax: 2, ay: 8 }, flip: false };
    case "lift":
      return { sprite: { rows: withHead(POSES.lift[(t >> 3) & 1], front), ax: 2, ay: 8 }, flip: g.phase % 2 === 1 };
    case "squat":
      return { sprite: { rows: withHead(SQUAT[(t >> 3) & 1], front, 7), ax: 9, ay: 8 }, flip: false };
    case "stretch":
      return { sprite: { rows: withHead(POSES.stretch[(t >> 4) & 1], front), ax: 2, ay: 8 }, flip: g.phase % 2 === 1 };
    case "desk":
      return { sprite: { rows: withHead(POSES.stand[0], back), ax: 2, ay: 8 }, flip: false };
    default:
      return { sprite: { rows: withHead(POSES.stand[0], front), ax: 2, ay: 8 }, flip: false };
  }
}

/** A speech bubble with how many things are waiting. The selected agent's turns orange. */
function drawBubble(c: Canvas, cx: number, top: number, waiting: number, on: boolean) {
  const label = waiting > 9 ? "9+" : String(waiting);
  const w = textWidth(label) + 4;
  const x = cx - Math.floor(w / 2);
  const fill: ColorKey = on ? "orange" : "paper";
  c.rect(x + 1, top - 1, w - 2, 11, "ink");
  c.rect(x - 1, top + 1, w + 2, 7, "ink");
  c.rect(x, top, w, 9, "ink");
  c.rect(x + 1, top, w - 2, 9, fill);
  c.rect(x, top + 1, w, 7, fill);
  c.rect(cx - 1, top + 10, 3, 1, "ink");
  c.dot(cx, top + 9, fill);
  c.dot(cx, top + 10, fill);
  c.dot(cx, top + 11, "ink");
  c.text(label, x + 2, top + 2, on ? "ink" : "orange2");
}

/** Paints one whole frame. `bg` is a copy of the background made by drawBackground. */
export function drawFrame(c: Canvas, bg: Uint32Array, scene: Scene, sim: Sim, view: FrameView): void {
  c.px.set(bg);
  const { tick } = view;

  // The neon sign hums, and now and then one letter blinks.
  const flicker = Math.floor(tick / 53) % 7 === 3 && tick % 53 < 3 ? Math.floor(tick / 53) % scene.sign.length : -1;
  for (let i = 0; i < scene.sign.length; i++) {
    const ch = scene.sign[i];
    if (ch === " ") continue;
    const x = scene.signX + i * SIGN_ADVANCE;
    if (i === flicker) {
      c.text(ch, x, SIGN_Y, "orange3");
      continue;
    }
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.text(ch, x + dx, SIGN_Y + dy, "orange3");
    c.text(ch, x + 1, SIGN_Y + 1, "orange2");
    c.text(ch, x, SIGN_Y, "neon");
  }

  // Wall screen: how the week is going, or "quiet today".
  const guests = clampGuests(view.guests);
  if (guests === 0) {
    c.text("QUIET", 13, 13, "orange");
    c.text("TODAY", 13, 19, "orange");
    if ((tick >> 3) & 1) c.rect(33, 23, 3, 1, "orange");
  } else {
    const word = MOOD_WORD[view.mood];
    c.text(word, 11 + Math.floor((29 - textWidth(word)) / 2), 13, "neon");
    const level = MOOD_LEVEL[view.mood] / 4;
    scene.bars.forEach((b, i) => {
      const h = Math.max(1, Math.round(1 + b * level * 5));
      const live = i === 6 && (tick >> 2) & 1;
      c.rect(12 + i * 4, 25 - h, 3, h, live ? "neon" : i === 6 ? "orange" : "orange2");
    });
  }
  c.rect(39, 12, 1, 2, "steel");

  // Everything that stands on the floor, nearest last.
  const list: Drawable[] = [];
  let order = 0;
  const occupied = new Set<string>();
  for (const g of sim.guests) if (g.state === "work" && g.spot >= 0 && g.x === SPOTS[g.spot].x && g.y === SPOTS[g.spot].y) occupied.add(SPOTS[g.spot].host ?? "");
  for (const p of PROPS) {
    list.push({
      z: p.z,
      order: order++,
      draw: () => {
        c.rects(p.rects);
        if (p.label) c.text(p.label.text, p.label.x, p.label.y, p.label.c);
        if (p.id.startsWith("tread-") && occupied.has(p.id)) {
          const x = Number(p.id.slice(6));
          for (let y = 36 + (tick % 3); y < 44; y += 3) c.rect(x + 1, y, 7, 1, "iron");
          c.rect(x + 2, 26, 5, 1, (tick >> 2) & 1 ? "neon" : "orange");
        }
      },
    });
  }
  for (const g of sim.guests) {
    if (g.state === "out") continue;
    const atSpot = g.state === "work" && g.spot >= 0;
    const z = atSpot ? (SPOTS[g.spot].z ?? g.y) : g.y;
    list.push({
      z,
      order: order++,
      draw: () => {
        const { sprite, flip } = guestSprite(g, tick);
        const pose = atSpot ? SPOTS[g.spot].pose : "stand";
        if (pose !== "bike" && pose !== "run") c.shade(g.x - 2, g.y + 1, 5, 1, 0.55);
        c.sprite(sprite, g.x, g.y, g.look, { flip });
      },
    });
  }
  const shown = new Map(view.agents.map((a) => [a.key, a]));
  for (const key of AGENT_ORDER) {
    if (!shown.has(key)) continue;
    const s = AGENT_STATIONS[key];
    const frame = key === "coach" ? (tick >> 2) & 1 : key === "memberships" ? (tick >> 4) & 1 : key === "marketing" ? ((tick >> 3) % 5 === 0 ? 1 : 0) : 0;
    const outline: ColorKey | undefined = view.selected === key ? "neon" : view.hovered === key ? "orange2" : undefined;
    list.push({
      z: s.y + 0.25,
      order: order++,
      draw: () => {
        if (view.selected === key) {
          c.rect(s.x - 5, s.y + 1, 11, 1, "orange2");
          c.rect(s.x - 3, s.y + 2, 7, 1, "orange3");
        }
        c.shade(s.x - 3, s.y + 1, 7, 1, 0.5);
        c.sprite(agentSprite(key, frame), s.x, s.y, AGENT_LOOKS[key], { outline });
      },
    });
  }
  list.sort((a, b) => a.z - b.z || a.order - b.order);
  for (const d of list) d.draw();

  // Bubbles and the selection marker float above everything.
  for (const key of AGENT_ORDER) {
    const a = shown.get(key);
    if (!a) continue;
    const s = AGENT_STATIONS[key];
    const top = s.y - 11;
    const bob = (tick >> 3) & 1;
    if (a.waiting > 0) {
      drawBubble(c, s.x + 1, top - 12 - bob, Math.floor(a.waiting), view.selected === key);
    } else if (view.selected === key) {
      const y = top - 6 - ((tick >> 2) & 1);
      c.rect(s.x - 2, y, 5, 1, "neon");
      c.rect(s.x - 1, y + 1, 3, 1, "neon");
      c.dot(s.x, y + 2, "neon");
    }
  }
}
