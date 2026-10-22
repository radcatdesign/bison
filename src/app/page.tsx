import { redirect } from "next/navigation";

// proxy.ts sends "/" to the last mode used. This is the fallback.
export default function Home() {
  redirect("/analyze");
}
