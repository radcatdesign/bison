// What sample data looks like for each kind of business. Add industries here.
// Onboarding lists each edition's industries by these labels.

export type IndustryPreset = {
  label: string;
  dailyVisitors: number;
  pages: string[];
  forms: { type: string; messages: string[] }[];
  referrers: string[];
  /** Starting choices for "I am a..." on signup forms. Values are stable; labels can change. */
  signupTypes: { value: string; label: string }[];
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
    signupTypes: [
      { value: "homeowner", label: "Homeowner" },
      { value: "pool-builder", label: "Pool builder" },
      { value: "dealer", label: "Dealer" },
    ],
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
    signupTypes: [
      { value: "home-brewer", label: "Home brewer" },
      { value: "cafe", label: "Cafe or shop" },
      { value: "office", label: "Office" },
    ],
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
    signupTypes: [
      { value: "customer", label: "Customer" },
      { value: "business", label: "Business" },
    ],
  },
  // Fit Funnels: the paths match the made-up traffic in the seed.
  gym: {
    label: "Gym or health club",
    dailyVisitors: 160,
    pages: ["/", "/memberships", "/classes", "/personal-training", "/free-pass"],
    forms: [
      { type: "Free trial pass", messages: ["Can I use the trial pass on a Saturday?", "Is the pool open to trial members?", "Can I bring a friend on my free pass?", "What time is the strength floor quietest?"] },
      { type: "Club tour", messages: ["Do you have childcare during morning classes?", "Can I come by for a tour after work, around 6?", "Switching gyms. Could someone show me the strength floor?"] },
      { type: "Personal training", messages: ["Looking for a coach to get back into lifting after an injury.", "Do any of your trainers work with older adults?", "Interested in a few sessions to learn the basics."] },
      { type: "Corporate membership", messages: ["We have 25 people downtown. What does a corporate rate look like?", "Does the club work with company wellness budgets?"] },
    ],
    referrers: ["google.com", "instagram.com", "facebook.com", "yelp.com", "classpass.com", "bing.com"],
    signupTypes: [
      { value: "thinking-about-joining", label: "Thinking about joining" },
      { value: "member", label: "Member" },
      { value: "former-member", label: "Former member" },
    ],
  },
  studio: {
    label: "Boutique studio",
    dailyVisitors: 110,
    pages: ["/", "/schedule", "/first-ride", "/packs", "/instructors"],
    forms: [
      { type: "First ride free", messages: ["Do I need clip-in shoes for my first class?", "Is the 6 am class good for beginners?", "Booked for Thursday, see you then.", "Can I bring a friend to my first ride?"] },
      { type: "Private event", messages: ["Team ride for 18 people on a Friday evening?", "Birthday ride for 12. Any Saturdays open?"] },
      { type: "Corporate membership", messages: ["Class packs for our office wellness budget?", "Could we set up a monthly ride for our team?"] },
      { type: "Class pack question", messages: ["Do 10-class packs expire?", "Can I share a pack with my partner?"] },
    ],
    referrers: ["google.com", "instagram.com", "tiktok.com", "classpass.com", "facebook.com", "yelp.com"],
    signupTypes: [
      { value: "new-rider", label: "New rider" },
      { value: "member", label: "Member" },
      { value: "company", label: "Company or team" },
    ],
  },
};

export function presetFor(industry: string): IndustryPreset {
  return INDUSTRIES[industry] ?? INDUSTRIES.general;
}
