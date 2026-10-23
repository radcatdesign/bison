// Made-up websites for sample mode, so the Landing pages screen has real pages
// to preview before a tenant's own site is connected. One per industry preset,
// for both editions (a gym and a cycling studio for Fit Funnels).

export type SitePage = { title: string; headline: string; sub: string; cta: string };

export type SampleSite = {
  /** Used when no company name is passed in. */
  fallbackName: string;
  nav: { path: string; label: string }[];
  theme: {
    bg: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
    accentInk: string;
    hero: string;
    font: string;
    display: string;
  };
  features: { title: string; body: string }[];
  proof: { quote: string; who: string };
  pages: Record<string, SitePage>;
  /** Where the button in the top bar goes, when it isn't a quote, contact or wholesale page. */
  ctaPath?: string;
};

export const SAMPLE_SITES: Record<string, SampleSite> = {
  pools: {
    fallbackName: "Your Pool Co.",
    nav: [
      { path: "/glow-aggregate", label: "Glow aggregate" },
      { path: "/mosaics", label: "Mosaics" },
      { path: "/gallery", label: "Gallery" },
      { path: "/dealers", label: "Dealers" },
    ],
    theme: {
      bg: "#06131f",
      surface: "#0c2233",
      ink: "#eaf8ff",
      muted: "#8fb3c7",
      accent: "#2ef2d0",
      accentInk: "#022a24",
      hero: "radial-gradient(60% 80% at 75% 20%, rgba(46,242,208,.35), transparent 60%), radial-gradient(50% 60% at 15% 90%, rgba(56,132,255,.35), transparent 60%), linear-gradient(180deg,#071a2a,#06131f)",
      font: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      display: "ui-serif, Georgia, 'Times New Roman', serif",
    },
    features: [
      { title: "Charges by day, glows all night", body: "Mixed into plaster or pebble, the aggregate soaks up sunlight and gives it back for hours after dark." },
      { title: "Safe in chlorine and salt", body: "Sealed and tested for pool water, so the color holds season after season." },
      { title: "Made for builders", body: "Bagged by coverage, shipped by the pallet, with trade pricing for dealers." },
    ],
    proof: { quote: "Clients see it at the night walk-through and that's the sale.", who: "Pool builder, Scottsdale" },
    pages: {
      "/": { title: "Glow-in-the-dark pool finishes", headline: "Your pool, lit from within", sub: "Glow aggregate and mosaics that charge in the sun and glow after dark. No wiring, no bulbs.", cta: "Get a quote" },
      "/glow-aggregate": { title: "Glow aggregate", headline: "Glow aggregate for plaster and pebble", sub: "Five colors, three grain sizes. Tell us your square footage and we'll tell you how much you need.", cta: "Price my pool" },
      "/mosaics": { title: "Glow mosaics", headline: "Mosaics that come alive at night", sub: "Waterline borders, steps and spa accents in hand-set glow glass.", cta: "See mosaic styles" },
      "/gallery": { title: "Project gallery", headline: "Real pools, day and night", sub: "Slide between daylight and after-dark shots from builders across the country.", cta: "Start your project" },
      "/dealers": { title: "Become a dealer", headline: "Stock the finish clients ask for", sub: "Trade pricing that steps down as you buy more, plus sample boards for your showroom.", cta: "Apply for trade pricing" },
      "/quote": { title: "Get a quote", headline: "Price your pool in two minutes", sub: "Square footage, color and finish. We'll email you the numbers and a sample pack.", cta: "Get my quote" },
      "/blog/night-swim-lighting": { title: "Night swim lighting guide", headline: "Lighting a pool for night swims", sub: "How glow finishes, LEDs and landscape lights work together, with photos from real backyards.", cta: "Read the guide" },
    },
  },
  coffee: {
    fallbackName: "Your Roastery",
    nav: [
      { path: "/shop", label: "Shop" },
      { path: "/subscriptions", label: "Subscriptions" },
      { path: "/wholesale", label: "Wholesale" },
      { path: "/cafes", label: "Cafes" },
    ],
    theme: {
      bg: "#f6efe6",
      surface: "#fffaf3",
      ink: "#2a1a12",
      muted: "#7a6152",
      accent: "#b4471f",
      accentInk: "#fff7ef",
      hero: "radial-gradient(60% 80% at 80% 10%, rgba(180,71,31,.22), transparent 60%), linear-gradient(180deg,#efe2d0,#f6efe6)",
      font: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      display: "ui-serif, Georgia, 'Times New Roman', serif",
    },
    features: [
      { title: "Roasted on Monday, at your door by Thursday", body: "Small batches, roasted to order, shipped the same week." },
      { title: "Beans we'd drink ourselves", body: "Direct relationships with farms in Huila, Sidama and Cajamarca." },
      { title: "Wholesale that shows up", body: "Weekly deliveries, barista training and equipment for cafes and offices." },
    ],
    proof: { quote: "Our customers noticed the switch the first morning.", who: "Cafe owner, Boise" },
    pages: {
      "/": { title: "Small-batch coffee roasters", headline: "Coffee roasted this week, not this season", sub: "Single origins and house blends, roasted in small batches and shipped fresh.", cta: "Shop coffee" },
      "/shop": { title: "Shop coffee", headline: "Find your next bag", sub: "Filter by roast, origin or how you brew. Every bag ships within three days of roasting.", cta: "Browse all coffee" },
      "/shop/house-blend": { title: "House Blend", headline: "House Blend", sub: "Chocolate, toasted almond and a little cherry. Our everyday cup, great as espresso or drip.", cta: "Add to cart" },
      "/wholesale": { title: "Wholesale coffee", headline: "Coffee for cafes, offices and restaurants", sub: "Tell us how much you pour each week and we'll build a program around it.", cta: "Talk to wholesale" },
      "/subscriptions": { title: "Coffee subscriptions", headline: "Never run out again", sub: "Pick your coffee and how often. Skip, swap or pause anytime.", cta: "Start a subscription" },
      "/cafes": { title: "Our cafes", headline: "Come have a cup with us", sub: "Two cafes, one roastery, and a seat by the window.", cta: "Find a cafe" },
      "/about": { title: "About us", headline: "Roasting since a garage in 2014", sub: "Same roaster, a bigger room, and the same obsession with a good cup.", cta: "Meet the team" },
    },
  },
  general: {
    fallbackName: "Your Company",
    nav: [
      { path: "/services", label: "Services" },
      { path: "/pricing", label: "Pricing" },
      { path: "/about", label: "About" },
      { path: "/contact", label: "Contact" },
    ],
    theme: {
      bg: "#ffffff",
      surface: "#f5f6fa",
      ink: "#14161c",
      muted: "#5d6474",
      accent: "#4f46e5",
      accentInk: "#ffffff",
      hero: "radial-gradient(60% 80% at 80% 0%, rgba(79,70,229,.16), transparent 60%), linear-gradient(180deg,#f7f7fb,#ffffff)",
      font: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      display: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    features: [
      { title: "Clear scope, clear price", body: "You know what you're getting and what it costs before we start." },
      { title: "A real person on every project", body: "One point of contact from the first call to the last invoice." },
      { title: "Done when we say", body: "We set the date together and we hit it." },
    ],
    proof: { quote: "They did what they said, when they said they would.", who: "Client, Portland" },
    pages: {
      "/": { title: "Home", headline: "Work done right, the first time", sub: "We help small teams get the important things finished.", cta: "Get in touch" },
      "/services": { title: "Services", headline: "What we do", sub: "Planning, building and looking after the things your business runs on.", cta: "See how we work" },
      "/pricing": { title: "Pricing", headline: "Simple pricing", sub: "Three plans, no surprises. Switch or cancel anytime.", cta: "Compare plans" },
      "/about": { title: "About", headline: "A small team that sweats the details", sub: "Ten years, a few hundred projects, and the same people answering the phone.", cta: "Meet the team" },
      "/contact": { title: "Contact", headline: "Let's talk", sub: "Tell us what you're working on. We reply within one business day.", cta: "Send a message" },
      "/blog": { title: "Blog", headline: "Notes from the work", sub: "Short, useful posts on what we're learning.", cta: "Read the latest" },
    },
  },
  // Fit Funnels: a full gym and a boutique cycling studio. Made up.
  gym: {
    fallbackName: "Your Club",
    nav: [
      { path: "/memberships", label: "Memberships" },
      { path: "/classes", label: "Classes" },
      { path: "/personal-training", label: "Personal training" },
      { path: "/free-pass", label: "Free pass" },
    ],
    ctaPath: "/free-pass",
    theme: {
      bg: "#111214",
      surface: "#1b1d21",
      ink: "#f4f4f2",
      muted: "#9a9ca3",
      accent: "#f76b15",
      accentInk: "#1c0b00",
      hero: "radial-gradient(60% 80% at 78% 15%, rgba(247,107,21,.32), transparent 60%), radial-gradient(45% 60% at 10% 95%, rgba(255,184,77,.14), transparent 60%), linear-gradient(180deg,#17181b,#111214)",
      font: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      display: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    features: [
      { title: "A strength floor built for lifting", body: "Racks, platforms and free weights, with coaches on the floor at the busy hours." },
      { title: "Classes all week", body: "Strength, HIIT, spin, yoga and aqua, from early morning to evening." },
      { title: "A pool and childcare", body: "Swim laps after you train, with childcare on site for members' kids." },
    ],
    proof: { quote: "The 6 a.m. strength class is the best hour of my week.", who: "Member since 2021" },
    pages: {
      "/": { title: "Strength club", headline: "Strength, classes and a pool under one roof", sub: "A full gym with a strength floor, group classes all week, a lap pool, personal training and childcare.", cta: "Claim a free pass" },
      "/memberships": { title: "Memberships", headline: "Pick the membership that fits your week", sub: "Monthly or annual, with classes, the pool and childcare included. Freeze it when you travel.", cta: "Compare memberships" },
      "/classes": { title: "Group classes", headline: "Over 60 classes a week", sub: "Strength, HIIT, spin, yoga and aqua, from 5:30 a.m. to 8 p.m. Book a spot the day before.", cta: "See the schedule" },
      "/personal-training": { title: "Personal training", headline: "Train one on one with a coach", sub: "Start with a consult. Your coach plans every session around what you want to work on.", cta: "Book a consult" },
      "/free-pass": { title: "Free pass", headline: "Try the club free for 7 days", sub: "The strength floor, every class and the pool. No card needed, nothing to cancel.", cta: "Claim my free pass" },
    },
  },
  studio: {
    fallbackName: "Your Studio",
    nav: [
      { path: "/schedule", label: "Schedule" },
      { path: "/packs", label: "Packs" },
      { path: "/instructors", label: "Instructors" },
      { path: "/first-ride", label: "First ride" },
    ],
    ctaPath: "/first-ride",
    theme: {
      bg: "#fff6f9",
      surface: "#ffffff",
      ink: "#1d0f1a",
      muted: "#7a5a6e",
      accent: "#e11d74",
      accentInk: "#ffffff",
      hero: "radial-gradient(60% 80% at 80% 10%, rgba(225,29,116,.22), transparent 60%), radial-gradient(45% 60% at 10% 90%, rgba(124,58,237,.14), transparent 60%), linear-gradient(180deg,#ffeef4,#fff6f9)",
      font: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      display: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    features: [
      { title: "45 minutes, start to finish", body: "Warm up, climb, sprint and cool down, all to the beat." },
      { title: "Shoes and water included", body: "Clip-in shoes in every size and cold water by the door." },
      { title: "Cycling and HIIT", body: "Ride, then add a 30-minute HIIT class when you want more." },
    ],
    proof: { quote: "Lights down, music up, and nobody cares how fast you go.", who: "Rider, Portland" },
    pages: {
      "/": { title: "Indoor cycling studio", headline: "Ride loud, ride in the dark", sub: "45-minute cycling classes and 30-minute HIIT, coached live with the music up.", cta: "Book a free first ride" },
      "/schedule": { title: "Class schedule", headline: "Classes from 6 a.m. to 7:30 p.m.", sub: "Cycling and HIIT every day. Book up to a week ahead and pick your bike.", cta: "Book a class" },
      "/first-ride": { title: "First ride free", headline: "Your first ride is on us", sub: "Book any cycling class. We fit your bike, lend you shoes and show you how to clip in.", cta: "Book my free ride" },
      "/packs": { title: "Class packs", headline: "Ride as often as you like", sub: "5, 10 or 20 class packs, or unlimited monthly. Packs never expire.", cta: "See the packs" },
      "/instructors": { title: "Instructors", headline: "Meet the coaches", sub: "Eight instructors, each with their own playlist and their own way of making a climb feel shorter.", cta: "Meet the team" },
    },
  },
};

export function sampleSiteFor(industry: string): SampleSite {
  return SAMPLE_SITES[industry] ?? SAMPLE_SITES.general;
}

/** Title for a page, falling back to its path. */
export function samplePageTitle(industry: string, path: string): string {
  return sampleSiteFor(industry).pages[path]?.title ?? path;
}
