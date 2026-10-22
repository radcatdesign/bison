// What sample data looks like for each kind of business. Add industries here.

export type IndustryPreset = {
  label: string;
  dailyVisitors: number;
  pages: string[];
  forms: { type: string; messages: string[] }[];
  referrers: string[];
};

export const INDUSTRIES: Record<string, IndustryPreset> = {
  pools: {
    label: "Pools and spas",
    dailyVisitors: 120,
    pages: ["/", "/glow-aggregate", "/mosaics", "/gallery", "/dealers", "/quote", "/blog/night-swim-lighting"],
    forms: [
      { type: "Quote request", messages: ["Pricing for a 16 by 32 pool with a glow finish?", "How much aggregate for a 600 sq ft resurface?", "Can you match the blue in your gallery photo?", "Spa only, about 8 feet round."] },
      { type: "Dealer inquiry", messages: ["We build about 30 pools a year and want trade pricing.", "Do you ship to Arizona? Interested in stocking two colors.", "Need a sample board for our showroom."] },
      { type: "Sample request", messages: ["Please send the aqua and green samples.", "Could I get a small bag of the blue to test under UV?"] },
    ],
    referrers: ["google.com", "instagram.com", "houzz.com", "youtube.com", "facebook.com", "bing.com"],
  },
  coffee: {
    label: "Coffee",
    dailyVisitors: 210,
    pages: ["/", "/shop", "/shop/house-blend", "/wholesale", "/subscriptions", "/cafes", "/about"],
    forms: [
      { type: "Wholesale inquiry", messages: ["Looking for an espresso blend for a new cafe, around 25 lb a week.", "Do you offer private label bags?", "Can we get a sample pack before ordering?"] },
      { type: "Event catering", messages: ["Espresso cart for a company party, 80 people.", "Coffee bar for a wedding in August?"] },
      { type: "Office coffee", messages: ["Weekly delivery for about 40 people.", "Do you lease brewers for offices?"] },
    ],
    referrers: ["google.com", "instagram.com", "yelp.com", "tiktok.com", "reddit.com", "bing.com"],
  },
  general: {
    label: "General",
    dailyVisitors: 90,
    pages: ["/", "/services", "/pricing", "/about", "/contact", "/blog"],
    forms: [
      { type: "Contact", messages: ["Can someone call me about pricing?", "Do you work with small teams?", "What's your availability next month?"] },
      { type: "Quote request", messages: ["Looking for a quote for a project starting in spring.", "Can you send rough numbers for our size?"] },
    ],
    referrers: ["google.com", "linkedin.com", "facebook.com", "bing.com", "duckduckgo.com"],
  },
};

export function presetFor(industry: string): IndustryPreset {
  return INDUSTRIES[industry] ?? INDUSTRIES.general;
}
