"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { CATALOG, formatPrice, type PaidItemKey } from "@/config/catalog";
import { itemOf } from "@/config/editions";
import { useEditionKey } from "../edition";
import s from "./ui.module.css";

/** What a locked module shows instead of its pages. Never a broken page. */
export function Locked({ item, canBuy, trialUsed }: { item: PaidItemKey; canBuy: boolean; trialUsed: boolean }) {
  const spec = { ...CATALOG[item], ...itemOf(useEditionKey(), item) };
  return (
    <div className={s.lockedWrap}>
      <div className={`card ${s.locked}`} data-testid="locked">
        <span className={s.lockBadge} aria-hidden="true">
          <Lock />
        </span>
        <span className="pill">Not on your plan</span>
        <h1 className={s.lockedName}>{spec.name}</h1>
        <p className={s.lockedPitch}>{spec.pitch}</p>
        <p className={s.lockedPrice}>
          <span className="num">{formatPrice(spec.price)}</span>
          {spec.price.placeholder ? <span className="pill">Placeholder price</span> : null}
          {!trialUsed && spec.trialDays ? <span className="muted">or free for {spec.trialDays} days</span> : null}
        </p>
        {canBuy ? (
          <Link href={`/settings/billing?item=${encodeURIComponent(item)}`} className="btn btn-primary" data-testid="unlock">
            Unlock {spec.name}
          </Link>
        ) : (
          <p className="notice">Ask an owner on your team to unlock {spec.name}.</p>
        )}
      </div>
    </div>
  );
}

