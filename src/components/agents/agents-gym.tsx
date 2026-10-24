"use client";

// The virtual gym on the Agents screen. Picking an agent shows their work below,
// by putting it in the address so the server lists just theirs.
import { useRouter } from "next/navigation";
import { VirtualGym } from "./virtual-gym";

type Agent = { key: "frontdesk" | "memberships" | "marketing" | "coach"; name: string; role: string; waiting: number };

export function AgentsGym({ club, guests, mood, agents, selected }: { club: string; guests: number; mood: "quiet" | "steady" | "busy" | "packed"; agents: Agent[]; selected: Agent["key"] | null }) {
  const router = useRouter();
  return <VirtualGym club={club} guests={guests} mood={mood} agents={agents} selected={selected} onSelect={(key) => router.push(key === selected ? "/agents" : `/agents?agent=${key}`, { scroll: false })} />;
}
