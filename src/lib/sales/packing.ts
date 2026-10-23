// The packing rules engine. Turns what's in a cart into the packages a carrier
// rates: items with a flat shipping charge skip the carrier, items that ship
// alone get a package each, and everything else fills the box it's set to,
// by count (units per box) and by weight. Pure, so it's tested on its own.
import type { Box } from "./settings";

export type PackLine = {
  variantId: string;
  name: string;
  qty: number;
  weightOz: number;
  /** Box key from shipping settings, or empty to share the biggest box. */
  box: string;
  unitsPerBox: number;
  shipsAlone: boolean;
  /** A flat charge per unit in place of a carrier rate. */
  flatShipCents: number | null;
};

export type Package = {
  boxKey: string;
  boxName: string;
  /** Contents plus the empty box. */
  weightOz: number;
  dims: { lengthIn: number; widthIn: number; heightIn: number } | null;
  items: { variantId: string; qty: number }[];
};

export type PackResult = {
  packages: Package[];
  /** The flat-rate part, charged on top of any carrier rate. */
  flatCents: number;
  /** Things the team should fix, like a product with no weight. Shoppers never see these. */
  warnings: string[];
};

/** UPS and most carriers stop at 150 lb a package. */
export const CARRIER_MAX_OZ = 150 * 16;
/** Above this many units, rating one unit at a time is too slow; checkout asks for a quote instead. */
export const MAX_UNITS = 1000;

export class PackingError extends Error {}

type OpenPackage = Package & { used: number; maxOz: number };

const EPS = 1e-9;

function dimsOf(box: Box | undefined): Package["dims"] {
  return box ? { lengthIn: box.lengthIn, widthIn: box.widthIn, heightIn: box.heightIn } : null;
}

function addItem(p: Package, variantId: string) {
  const found = p.items.find((i) => i.variantId === variantId);
  if (found) found.qty += 1;
  else p.items.push({ variantId, qty: 1 });
}

export function pack(lines: PackLine[], boxes: Box[]): PackResult {
  const warnings: string[] = [];
  const units = lines.reduce((n, l) => n + Math.max(0, l.qty), 0);
  if (units > MAX_UNITS) throw new PackingError(`That's more than ${MAX_UNITS} items to pack at once.`);

  const byKey = new Map(boxes.map((b) => [b.key, b]));
  // Items without a box (or with a box that was since deleted) share the box that holds the most.
  const biggest = [...boxes].sort((a, b) => b.maxWeightLb - a.maxWeightLb)[0];

  let flatCents = 0;
  const packages: Package[] = [];
  const open: OpenPackage[] = [];

  // Heaviest first packs boxes more evenly.
  const queue: { line: PackLine; box: Box | undefined }[] = [];
  for (const line of lines) {
    if (line.qty <= 0) continue;
    if (line.flatShipCents !== null) {
      flatCents += line.flatShipCents * line.qty;
      continue;
    }
    if (!(line.weightOz > 0)) warnings.push(`${line.name} has no weight, so carriers rate it as nothing. Add a weight in Products.`);
    let box = line.box ? byKey.get(line.box) : undefined;
    if (line.box && !box) warnings.push(`${line.name} is set to a box that no longer exists, so it shares the biggest box.`);
    if (!box) box = biggest;

    if (line.shipsAlone) {
      for (let i = 0; i < line.qty; i++) {
        const own = line.box ? byKey.get(line.box) : undefined;
        packages.push({ boxKey: own?.key ?? "", boxName: own?.name ?? "Its own packaging", weightOz: line.weightOz + (own?.emptyWeightOz ?? 0), dims: dimsOf(own), items: [{ variantId: line.variantId, qty: 1 }] });
      }
      continue;
    }
    queue.push({ line, box });
  }

  const units2: { line: PackLine; box: Box | undefined }[] = [];
  for (const q of queue) for (let i = 0; i < q.line.qty; i++) units2.push(q);
  units2.sort((a, b) => b.line.weightOz - a.line.weightOz);

  for (const { line, box } of units2) {
    const share = 1 / Math.max(1, line.unitsPerBox);
    const maxOz = box ? box.maxWeightLb * 16 : CARRIER_MAX_OZ;
    const key = box?.key ?? "";
    let target = open.find((p) => p.boxKey === key && p.used + share <= 1 + EPS && p.weightOz + line.weightOz <= p.maxOz + EPS);
    if (!target) {
      target = { boxKey: key, boxName: box?.name ?? "Package", weightOz: box?.emptyWeightOz ?? 0, dims: dimsOf(box), items: [], used: 0, maxOz };
      open.push(target);
      if (target.weightOz + line.weightOz > maxOz) warnings.push(`One ${line.name} is heavier than the ${box?.name ?? "package"} can hold, so it's rated on its own.`);
    }
    target.used += share;
    target.weightOz += line.weightOz;
    addItem(target, line.variantId);
  }

  for (const p of open) packages.push({ boxKey: p.boxKey, boxName: p.boxName, weightOz: p.weightOz, dims: p.dims, items: p.items });
  for (const p of packages) {
    p.weightOz = Math.round(p.weightOz * 100) / 100;
    if (p.weightOz > CARRIER_MAX_OZ) warnings.push(`A package weighs ${Math.round(p.weightOz / 16)} lb, over the 150 lb most carriers take. It may need freight.`);
  }
  return { packages, flatCents, warnings: [...new Set(warnings)] };
}

/** Total shipped weight, for flat rules and display. */
export function totalWeightOz(packages: Package[]): number {
  return Math.round(packages.reduce((n, p) => n + p.weightOz, 0) * 100) / 100;
}
