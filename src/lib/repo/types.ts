// What screens read. Each repository has a database version and a sample version.
import type { ContactStatus } from "@/lib/db/types";

export type ContactListItem = {
  id: string;
  name: string;
  email: string;
  /** Name, or the email when there is no name. */
  displayName: string;
  status: ContactStatus;
  isNew: boolean;
  formType: string | null;
  message: string | null;
  lastSeenAt: Date;
};

export type ContactSubmission = { id: string; formType: string; fields: Record<string, string>; createdAt: Date };

export type ContactDetail = ContactListItem & { phone: string; firstSeenAt: Date; submissions: ContactSubmission[] };

export interface ContactsRepo {
  list(opts?: { limit?: number }): Promise<ContactListItem[]>;
  get(id: string): Promise<ContactDetail | null>;
  setStatus(id: string, status: ContactStatus): Promise<void>;
}

export type Totals = {
  visitors: number;
  pageviews: number;
  visits: number;
  /** 0 to 1. Null when there are no visits. */
  bounceRate: number | null;
  avgActiveSeconds: number | null;
  pagesPerVisit: number | null;
  /** Share of visits from returning browsers, 0 to 1. */
  returningShare: number | null;
};

export type DailyPoint = { date: string; visitors: number; pageviews: number; visits: number };

export type AnalyticsSummary = {
  rangeDays: number;
  current: Totals;
  previous: Totals;
  daily: DailyPoint[];
  topPages: { path: string; views: number }[];
};

export interface AnalyticsRepo {
  summary(rangeDays: number): Promise<AnalyticsSummary>;
}

export type DataMode = "sample" | "live";

export class SampleModeError extends Error {
  constructor() {
    super("Sample data is on, so nothing is saved. Turn it off in Settings to work with your own data.");
  }
}

export class NotFoundError extends Error {}

export function displayNameFor(name: string, email: string): string {
  return name.trim() || email;
}
