import "server-only";
// Fetching a Shopify store's public product list or a product feed from an
// address the company gives us. Public https only: no private networks, no
// redirects to them, a size cap and a time limit.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class RemoteError extends Error {}

const MAX_BYTES = 5_000_000;

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.") || v === "::";
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new RemoteError("Use an https:// address.");
  if (url.username || url.password) throw new RemoteError("That address can't include a password.");
  if (isIP(url.hostname)) throw new RemoteError("Use the site's name, not a number address.");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new RemoteError(`Couldn't find ${url.hostname}. Check the address.`);
  }
  if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw new RemoteError("That address isn't on the public internet.");
}

/** Reads a public https address as text, following up to three redirects that stay public. */
export async function fetchPublicText(address: string, fetcher: typeof fetch = fetch): Promise<string> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new RemoteError("That isn't a web address.");
  }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    let res: Response;
    try {
      res = await fetcher(url, { redirect: "manual", headers: { accept: "application/json, application/xml, text/xml, text/csv, text/plain, */*", "user-agent": "BisonOps-Importer/1.0" }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new RemoteError(`${url.hostname} didn't answer in time.`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (res.status === 404) throw new RemoteError(`Nothing at that address on ${url.hostname}.`);
    if (!res.ok) throw new RemoteError(`${url.hostname} answered with an error (${res.status}).`);
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new RemoteError("That's over 5 MB. Use a smaller feed.");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new RemoteError("Too many redirects.");
}
