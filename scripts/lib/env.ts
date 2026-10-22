// Loads .env files the same way Next.js does, for scripts run outside Next.
import { loadEnvConfig } from "@next/env";

export function loadEnv() {
  const dev = process.env.NODE_ENV !== "production";
  loadEnvConfig(process.cwd(), dev, { info: () => {}, error: console.error });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

export function describeUrl(url: string): string {
  const u = new URL(url);
  return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}
