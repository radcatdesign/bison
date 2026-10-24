"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_ORDER,
  agentAt,
  agentPortrait,
  type AgentKey,
  buildScene,
  Canvas,
  clampGuests,
  COLOR_KEYS,
  COLOR_TOKENS,
  createSim,
  describeScene,
  drawBackground,
  drawFrame,
  GYM_H,
  GYM_W,
  hashSeed,
  type Mood,
  type Palette,
  parseColor,
  stepSim,
} from "./gym-scene";
import s from "./virtual-gym.module.css";

export type GymAgent = { key: AgentKey; name: string; role: string; waiting: number };

export type VirtualGymProps = {
  /** Shown on the neon sign over the door, in capitals, cut short if long. */
  club: string;
  /** People on the floor, 0 to 30. */
  guests: number;
  mood: Mood;
  /** Any of the four. Only these are drawn, each at their own station. */
  agents: GymAgent[];
  selected?: AgentKey | null;
  onSelect?: (key: AgentKey) => void;
};

const STEP_MS = 1000 / 12;

/** Reads the pixel palette from tokens.css. Any CSS color works; a canvas resolves the ones parseColor can't. */
function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const pal = {} as Palette;
  for (const key of COLOR_KEYS) {
    const value = css.getPropertyValue(COLOR_TOKENS[key]).trim();
    let packed = parseColor(value);
    if (packed === null && probe && value) {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = value;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      packed = parseColor(`rgb(${r} ${g} ${b})`);
    }
    pal[key] = packed ?? parseColor("rgb(0 0 0)")!;
  }
  return pal;
}

/** Where the 192 x 108 scene sits on the canvas: whole-number scaling when it nearly fills the width, otherwise stretched to fit. */
function fit(width: number, height: number) {
  const k = Math.min(Math.floor(width / GYM_W), Math.floor(height / GYM_H));
  if (k >= 1 && width - GYM_W * k <= width * 0.1) {
    return { scale: k, ox: Math.floor((width - GYM_W * k) / 2), oy: Math.floor((height - GYM_H * k) / 2) };
  }
  const scale = Math.min(width / GYM_W, height / GYM_H);
  return { scale, ox: Math.round((width - GYM_W * scale) / 2), oy: Math.round((height - GYM_H * scale) / 2) };
}

/**
 * The club as a little 8-bit gym. Guests on the floor follow the last 7 days of
 * marketing, and the agents work at their stations. Pick one on the screen or in
 * the row of buttons under it.
 */
export function VirtualGym({ club, guests, mood, agents, selected = null, onSelect }: VirtualGymProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<AgentKey | null>(null);
  const count = clampGuests(guests);
  const shown = useMemo(() => AGENT_ORDER.map((k) => agents.find((a) => a.key === k)).filter((a): a is GymAgent => !!a), [agents]);
  const keys = useMemo(() => shown.map((a) => a.key), [shown]);
  const label = describeScene(club, mood, count, shown);

  // The animation loop reads the latest props from here, so it never restarts for a click.
  const viewRef = useRef({ mood, agents: shown, selected, hovered });
  const paintRef = useRef<(() => void) | null>(null);
  const layoutRef = useRef({ scale: 1, ox: 0, oy: 0 });

  useEffect(() => {
    viewRef.current = { mood, agents: shown, selected, hovered };
    paintRef.current?.();
  }, [mood, shown, selected, hovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const pal = readPalette(canvas);
    const voidColor = getComputedStyle(canvas).getPropertyValue(COLOR_TOKENS.void).trim();
    const scene = buildScene(club);
    const seed = hashSeed(club);
    const off = document.createElement("canvas");
    off.width = GYM_W;
    off.height = GYM_H;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    const image = offCtx.createImageData(GYM_W, GYM_H);
    const px = new Canvas(pal, new Uint32Array(image.data.buffer));
    drawBackground(px, scene);
    const bg = px.px.slice();

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let sim = createSim(seed, count, reduced.matches ? 1 : 0.75);

    const paint = () => {
      const v = viewRef.current;
      drawFrame(px, bg, scene, sim, { tick: sim.tick, mood: v.mood, guests: count, agents: v.agents, selected: v.selected, hovered: v.hovered });
      offCtx.putImageData(image, 0, 0);
      const { scale, ox, oy } = layoutRef.current;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = voidColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, ox, oy, GYM_W * scale, GYM_H * scale);
    };
    paintRef.current = paint;

    // Size the backing store to real device pixels and draw at a whole-number scale where it fits.
    const resize = (w: number, h: number) => {
      const width = Math.max(1, Math.round(w));
      const height = Math.max(1, Math.round(h));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      layoutRef.current = fit(width, height);
      paint();
    };
    const ro = new ResizeObserver(([entry]) => {
      // The exact device-pixel box when the browser reports one that agrees with the ratio; some (headless, emulated) don't.
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = entry.contentRect;
      const box = entry.devicePixelContentBoxSize?.[0];
      if (box && Math.abs(box.inlineSize - width * dpr) <= 2) resize(box.inlineSize, box.blockSize);
      else resize(width * dpr, height * dpr);
    });
    try {
      ro.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      ro.observe(canvas);
    }

    // About 12 frames a second, and only while someone can see it.
    let raf = 0;
    let running = false;
    let onScreen = true;
    let last = 0;
    let carry = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      carry += last ? Math.min(t - last, 250) : 0;
      last = t;
      if (carry < STEP_MS) return;
      while (carry >= STEP_MS) {
        stepSim(sim);
        carry -= STEP_MS;
      }
      paint();
    };
    const sync = () => {
      const go = onScreen && !document.hidden && !reduced.matches;
      if (go && !running) {
        running = true;
        last = 0;
        carry = 0;
        raf = requestAnimationFrame(frame);
      } else if (!go && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    io.observe(canvas);
    const onMotion = () => {
      sim = createSim(seed, count, reduced.matches ? 1 : 0.75);
      paint();
      sync();
    };
    reduced.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      reduced.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", sync);
      paintRef.current = null;
    };
  }, [club, count]);

  /** Turns a pointer position into scene pixels and finds the agent there. */
  const agentUnder = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const { scale, ox, oy } = layoutRef.current;
    const dx = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const dy = ((e.clientY - rect.top) * canvas.height) / rect.height;
    return agentAt(Math.floor((dx - ox) / scale), Math.floor((dy - oy) / scale), keys);
  };

  return (
    <div className={s.gym} data-testid="virtual-gym">
      <div className={s.bezel}>
        <div className={s.screen}>
          <canvas
            ref={canvasRef}
            className={s.canvas}
            role="img"
            aria-label={label}
            data-pointer={hovered ? "true" : undefined}
            onClick={(e) => {
              const key = agentUnder(e);
              if (key) onSelect?.(key);
            }}
            onPointerMove={(e) => setHovered(e.pointerType === "mouse" ? agentUnder(e) : null)}
            onPointerLeave={() => setHovered(null)}
          />
        </div>
        <span className={s.led} aria-hidden="true" />
      </div>

      {shown.length > 0 && (
        <div className={s.legend} role="group" aria-label="Agents in the gym">
          {shown.map((a) => {
            const waiting = Math.max(0, Math.floor(a.waiting));
            return (
              <button key={a.key} type="button" className={s.agent} aria-pressed={selected === a.key} onClick={() => onSelect?.(a.key)} data-testid={`gym-agent-${a.key}`}>
                <span className={s.avatar}>
                  <Portrait agent={a.key} />
                  {waiting > 0 && (
                    <span className={s.badge} aria-hidden="true">
                      {waiting > 99 ? "99+" : waiting}
                    </span>
                  )}
                </span>
                <span className={s.text}>
                  <span className={s.name}>{a.name}</span>
                  <span className={s.role}>{a.role}</span>
                  <span className={waiting > 0 ? s.waiting : s.clear}>{waiting > 0 ? `${waiting} waiting` : "Nothing waiting"}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The agent's head and shoulders, drawn with the same pixels and tokens as the gym. */
function Portrait({ agent }: { agent: AgentKey }) {
  const pixels = useMemo(() => agentPortrait(agent), [agent]);
  return (
    <svg viewBox="-1 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      {pixels.map((p) => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={`var(${COLOR_TOKENS[p.c]})`} />
      ))}
    </svg>
  );
}
