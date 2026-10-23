// Non-negotiable copy rules, enforced: no em dashes and none of the banned filler,
// anywhere in the product or the tenant guide.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const BANNED = [/seamless/i, /\bleverag(e|ing)\b/i, /unlock the power/i, /\bsynerg/i, /cutting[- ]edge/i, /game[- ]changer/i, /\bempower/i, /\brobust\b/i, /\(no name\)/i];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(tsx?|css|md)$/.test(name) ? [full] : [];
  });
}

// The page agent's list of words it must never write has to name them.
const EXEMPT = new Set([path.join(ROOT, "src/lib/pages/agent/banned-words.ts")]);
const targets = [...files(path.join(ROOT, "src")), path.join(ROOT, "docs/tenant-guide.md")].filter((f) => !EXEMPT.has(f));

describe("copy rules", () => {
  it("has no em dashes", () => {
    const hits = targets.filter((f) => readFileSync(f, "utf8").includes("—")).map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  it("has no banned filler words", () => {
    const hits: string[] = [];
    for (const f of targets) {
      const text = readFileSync(f, "utf8");
      for (const re of BANNED) if (re.test(text)) hits.push(`${path.relative(ROOT, f)}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});
