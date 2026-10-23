# Bison Ops: a guide for your team

Bison Ops shows you who visits your website, collects everyone who contacts you, and, when you add them, helps you sell and email from the same place.

## Getting around

There are three modes along the top, or along the bottom on your phone:

- **Analyze** shows your visitors and your contacts. Everyone on your team can see it.
- **Marketing** is for email and pages: newsletters, automatic email series, your subscriber list, landing pages and how you show up in search.
- **Sales** is for estimates, invoices, orders and your online store.

Bison Ops opens the mode you used last. **Updates** lists every change we make. **Settings** holds your plan, your team and your connections.

On your phone, tap **Menu** in the bar at the bottom for the pages inside a mode. Pull down from the top of any page to refresh it. To put Bison Ops on your home screen, open it in your phone's browser and choose Add to Home Screen.

## Sample data

A new account starts with sample data, so every screen shows how it works before your own visitors arrive. Sample data is made up, and nothing you change while it's on is saved. When your own data starts coming in, turn it off in **Settings**, under Data. Only owners and admins can switch it.

In Marketing, sample data covers the people: subscribers, welcome codes and results. Your newsletters, series, brand kit and settings save either way, so you can set everything up first. Sending to your list waits until sample data is off, because the list on screen is made up. Tests to yourself work any time.

## What the numbers mean

Every number has a **?** next to it. Tap it to see exactly how it's counted. A few worth knowing:

- **Visitors** count each browser once per day. We don't use cookies to do it, and nobody can be followed from one day to the next.
- **Average active visit** only counts time when someone is really there: the page is on screen and they've scrolled, clicked, typed or moved in the last two minutes.
- **Bounce rate** is the share of visits that saw one page, did nothing, and left within 10 seconds.

## Adding modules

If your plan doesn't include a mode, opening it shows what it does and an **Unlock** button. From there, an owner can start a 14-day trial with no card, or subscribe. When a module is turned off, your data stays. Turn it back on and everything is where you left it.

## Setting up Marketing

Open **Marketing**, then **Setup**. It lists every step for every tool in the order that works best, ticks each one off as soon as it's really done, and points to the next one. Each tool also shows its own steps at the top of its page until they're finished; fold them away any time. Plan on about an hour, most of it waiting for DNS.

### 1. Email sending (Settings, Email sending)

An owner or admin does this once. It lets your email come from your own address, which is what gets it into inboxes.

1. **Add your domain.** Use a subdomain like `mail.yourcompany.com`. Your everyday email keeps working exactly as it does, and marketing email can't hurt its reputation.
2. **Add the DNS records.** Bison Ops shows three records with copy buttons. Add them wherever your domain's DNS is managed (the page has steps for Cloudflare, GoDaddy, Namecheap and Squarespace, and a note for everyone else). If someone else handles your DNS, send them the three records. Leave the page open and it checks every 20 seconds. Most hosts take a few minutes; some take up to a day.
3. **Pick your From name and address,** like "Ridgeline Roasters" and hello@mail.yourcompany.com, and where replies go.
4. **Send yourself a test.** It lands in your own inbox, from your own address.

You never need an API key or a password for any of this.

### 2. Brand kit

Your logo, colors, fonts, button shape, sign-off and social links, set once. Every email and new landing page uses them. **Your postal address is required** (US law, and similar rules elsewhere); a PO box is fine. Nothing sends until it's in.

### 3. Subscribers

- **"I am a..."** Signup forms ask what kind of customer someone is. You start with a few choices for your industry; rename, add or remove them. Renaming keeps everyone who picked it.
- **Import** a CSV exported from Mailchimp, Constant Contact or a spreadsheet. It needs an Email column; name and type columns are picked up too. You'll confirm everyone agreed to get email from you. People already on your list only get blanks filled in, and anyone who unsubscribed before stays unsubscribed.
- **Lists** are optional. Make them if you send different things to different groups.
- **Signup forms.** Open any landing page, edit its form and turn on "Add to email list". The product launch and free guide templates come with it on.

Everyone who unsubscribes, bounces or marks an email as spam goes on a do-not-email list that every send checks. Your team can't put them back; they can sign up again themselves.

### 4. Welcome series

Three welcome emails are written for you. Fill in the yellow spots (only you know what you're known for), then turn the series on. Everyone who joins gets the first email right away and the rest on schedule. You can add series for other moments too: someone sending a particular form, or one you start yourself for a list. Turning a series off pauses it; turned back on, everyone picks up where they were, without getting several at once.

### 5. Newsletters

Pick a template or start blank, then click any part of the email to change it. The panel on the right edits whatever you clicked; **Email** holds the subject line and preview text. Yellow spots mark things only you know, and sending waits until they're filled in. Send yourself a test, then send it to everyone or one list, now or up to 30 days ahead. Results show how many were sent, delivered, bounced and unsubscribed.

### 6. Welcome offer (optional)

A one-time code for each new subscriber's first order: a percent or amount off, how many days it lasts, and any fine print. Add a "Welcome offer code" section to your first welcome email and turn the offer on; each person sees their own code. Until Sales is set up, look a code up on this page when someone uses it and mark it used.

### 7. Search pack

Describe your business in a plain paragraph and add your phone, email and hours. Bison Ops turns that and your published pages into a sitemap, `llms.txt` for AI assistants, titles, social cards and structured data. Then paste your sitemap address into Google Search Console and Bing Webmaster Tools and mark that step done; it's the only step nobody can check for you. You can also keep AI crawlers out, and copy lines for your own website's robots.txt.

## Building a landing page

Pages are in Marketing. Describe the page you want in plain words: who it's for, what you're offering, and what people should do. For example: "A spring sale page for glow aggregate, 15% off through May, with a quote form and a few common questions." The agent builds it section by section while you watch.

- **Or start from a template.** Pick one of eight, from a quote request to a free guide. It opens with your company name and brand color already in; untick "Use my brand color" to keep the template's own colors.
- **Change it by asking.** "Make it dark", "add an FAQ", "shorten the copy". Undo takes back any change.
- **Or change it by hand.** Open Sections to edit any text, reorder sections or add new ones. Page sets the colors, type and corners.
- **Check the yellow.** The agent never makes up prices, dates, reviews or numbers. Anything only you know is marked in yellow, and the page can't go live until those are filled in.
- **Publish.** The page goes live at its own address. Anyone who sends its form shows up in Contacts.

Desktop, tablet and phone buttons show the page at each size. On a phone, Preview is its own tab.

## Your team

| Role | Sees | Can |
|---|---|---|
| Owner | Everything | Everything, including the plan, email sending setup and deleting the account |
| Admin | Everything | Everything except the plan, including email sending setup |
| Sales | Analyze and Sales | Work contacts, send email, issue refunds |
| Marketing | Analyze and Marketing | Work contacts, build and send newsletters and series, manage subscribers, build and publish landing pages |
| Viewer | Analyze | Look only |

## Your data

Your company's data is kept apart from every other company's by the database itself, not just by our code. You can export everything, or delete any one person's data by their email address. Those tools arrive with the next release. Your subscriber list can be exported as a CSV from Subscribers any time.
