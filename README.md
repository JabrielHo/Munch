# Munch 🎉 — _plans, sorted in the chat_

A Telegram bot + Mini App for the group chat that never actually decides
anything. Someone sends `/hangout`, picks a day and a time, and the bot posts a
card with three buttons: **I'm in**, **Maybe**, **Can't**. One tap and you're on
the list. On the day itself the bot posts a reminder naming everyone who said
yes.

The whole thing is built around one rule: **nobody should have to learn
anything.** The buttons are on the message, in the chat, where your friends
already are. Opening the Mini App is optional — it's for the person planning,
and for the part where the group argues about food.

- **Where are we going?** Either the host types a place, or hands the question
  to a Munch round: everyone throws in a spot or a craving, votes, and the host
  spins the wheel. Whatever wins becomes the hangout's place, automatically.
- **The chat is the notice board.** One card per hangout, edited in place as
  replies come in, plus the reminder on the day.
- **No accounts.** Identity comes from Telegram, and access is granted only to
  current members of the group.

All times are **Asia/Singapore**. It has no daylight saving, so a fixed offset
is exact — see [`convex/time.ts`](convex/time.ts).

## Commands

| Command | Does |
| --- | --- |
| `/hangout [what]` | Start planning. Posts a card; you fill in the details in the app, then post it to the chat. |
| `/plans` | What this chat has coming up |
| `/munch [title]` | Just deciding where to eat — a round with voting and the wheel, no date attached |
| `/help` | How it works |

## Tech stack

| Layer | Choice |
| --- | --- |
| Bot + backend | **Convex** — HTTP action webhook, reactive queries, scheduler |
| Mini App | **React + Vite + TypeScript**, **Tailwind CSS v4** + **shadcn/ui** |
| Hosting | **Cloudflare Pages** (Mini App static bundle) + Convex (backend) |

There is no auth stack. The bot verifies Telegram's webhook secret; the Mini App
proves who you are with Telegram's signed `initData` (HMAC), then trades it for
a short-lived token proving you're currently in the group — which every read and
write has to present.

RSVP taps are the exception, and deliberately so: a button press on the card
arrives as a signed webhook update carrying the tapping user, and anyone who can
see the message is in the group by definition. No token, no app, no friction.

---

## Run it locally

**1. Install**

```bash
npm install
```

**2. Start Convex** (creates your backend + writes `.env.local`)

```bash
npx convex dev
```

The first run asks you to log in (free Convex account) and creates a **dev
deployment** in the cloud. Leave this running — it watches `convex/` and pushes
changes.

**3. Create the bot** — talk to [@BotFather](https://t.me/BotFather): `/newbot`,
pick a name and username, copy the token. Leave **group privacy ON** (the
default) — the bot only needs commands and taps on its own messages. Register
the command list with `/setcommands`:

```
hangout - Plan something
plans - What's coming up
munch - Just decide where to eat
help - How it works
```

**4. Give the deployment the token + a webhook secret** (any long random
string — it's how we know updates really come from Telegram):

```bash
npx convex env set TELEGRAM_BOT_TOKEN 123456789:AA...your-token
npx convex env set TELEGRAM_WEBHOOK_SECRET some-long-random-string
```

**5. Point Telegram at your deployment.** HTTP actions are served on the
`.convex.site` domain (not `.convex.cloud` — check the Convex dashboard for
your exact URL):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-deployment.convex.site/telegram" \
  -d "secret_token=some-long-random-string"
```

**6. Add the bot to a group** and send `/hangout`. 🎉

---

## How a hangout works

1. `/hangout dinner` — the sender becomes the host. The bot posts a **draft**
   card that only says who's setting it up. Nobody can reply to it yet.
2. The host taps **⚙️ Set it up**, which opens the Mini App: name it, tap a day,
   tap a time, and either type a place or choose **Let us pick**.
3. **Post it to the chat** replaces the draft with the live card: the plan on
   top, three RSVP buttons underneath, the guest list filling in as people tap.
4. Choosing **Let us pick** creates a Munch round attached to the hangout. When
   the wheel lands, the winner is written straight onto the hangout's card.
5. On the morning of the hangout (**9am**), the bot posts a reminder listing
   everyone who's coming. A hangout published after that gets its reminder an
   hour before the start instead; one published inside that last hour gets none,
   because the reminder would land on top of the thing it was reminding about.
6. The host can **edit** the plan or **call it off** at any point. Moving it
   moves the reminder — the old scheduled job is always cancelled first, so two
   reminders can never race.

Editing, cancelling, and RSVP-ing from inside the app all re-render the chat
card through a debounced refresh, so a burst of taps is one message edit rather
than ten. Telegram rate limits edits; this is why.

### And a round on its own

`/munch` still does exactly what it always did: a round of adding places and
cravings, voting, and the host spinning the wheel or locking the top pick, with
a live scoreboard in the chat. A chat can run several at once, each on its own
message, and near-simultaneous `/munch`es merge into one round so a race to
start doesn't split the group.

---

## The Mini App

The card's button opens the Mini App over the chat. Identity is `tg:<user id>`,
derived server-side from Telegram's signed `initData`, so there's no name gate
and nothing to spoof. Before anything renders, the app trades that identity for
a short-lived access token that is only granted to a **current member of the
group** — every read, write, and host action presents it, so a forwarded link
gets nowhere.

> ⚠️ The Mini App is a hosted web page — Cloudflare Pages (or any static host)
> must keep serving the app for it to work.

**1. Register it** — in [@BotFather](https://t.me/BotFather): `/newapp`, pick
your bot, set the **Web App URL** to `https://your-domain.com/tg`, and choose a
short name (e.g. `munch`). That mints the direct link `https://t.me/YourBot/munch`.

**2. Tell the deployment about the link** (without it, cards have no button at
all, since there is no other way into the app):

```bash
npx convex env set TELEGRAM_MINIAPP_LINK https://t.me/YourBot/munch
```

The bot appends `?startapp=<code>` per card. Hangout codes carry an `h-` prefix;
round codes are bare UUIDs, which always start with a hex digit, so the `/tg`
route can tell the two apart — and links posted before hangouts existed still
land in the right place.

**Mini App dev loop:** `npm run dev` serves the app at localhost, but Telegram
needs a public HTTPS URL — deploy to Pages (or tunnel) to test inside Telegram.

For quick browser-based dev without Telegram, mint yourself an access token by
hand. Outside Telegram there's no signed `initData` to verify, so the app skips
`enterGroup` and reads a token straight from `localStorage`. Grab a `code` from
any Open-in-Munch button's `?startapp=` (drop the `h-`) or from the `hangouts`
table in the Convex dashboard, then:

```bash
npx convex run telegram:devGrantSession '{"code":"<hangout or round code>","tgUserId":123456,"name":"Dev"}'
```

That prints a token. Put it in `localStorage` as `munch.token` and open
`/p/<hangout code>`; you'll act as `tg:123456`, and the same token works for
everything in that group.

The grant skips the group-membership check that `enterGroup` enforces, so it's
strictly a dev convenience. Telegram is the front door; there is no other web
entrance.

### Make the food suggestions real for your city

Open [`convex/foods.ts`](convex/foods.ts) and fill in the `spots` arrays, e.g.:

```ts
ramen: { emoji: "🍜", cuisine: "Japanese", spots: ["Ramen Keisuke", "Marutama"] },
```

Now when "ramen" wins a round, the result suggests one of your spots and links
to Maps. Add new foods and synonyms the same way — no API key, works anywhere.

---

## Deploy

### 1. Push the backend to production

```bash
npx convex deploy
```

Then repeat the bot setup against **production**: set `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, and (once the Mini App is registered)
`TELEGRAM_MINIAPP_LINK` with `npx convex env set --prod …`, and point
`setWebhook` at the **prod** `.convex.site` URL. One bot can only have one
webhook — use separate bots for dev and prod if you want both live.

### 2. Deploy the Mini App to Cloudflare Pages

Connect the repo in the Cloudflare Pages dashboard, then set:

- **Build command:** `npx convex deploy --cmd 'npm run build'`
- **Build output directory:** `dist`
- **Environment variable:** `CONVEX_DEPLOY_KEY` — generate it in the Convex
  dashboard (_Settings → Deploy keys → Production_).

That single build command deploys your Convex functions **and** builds the
frontend with the correct `VITE_CONVEX_URL` baked in. The included
[`public/_redirects`](public/_redirects) makes the deep links work on a hard
refresh.

### 3. Point your domain

Add your custom domain under the Pages project and set the BotFather **Web App
URL** to `https://your-domain.com/tg`.

---

## Project layout

```
convex/            Backend: schema, hangouts, rounds, the Telegram bot
  schema.ts        Tables: hangouts, rsvps, rooms, options, votes, presence, roomSessions
  time.ts          Singapore wall-clock helpers + when the reminder fires
  hangouts.ts      The plan: details, RSVPs, the reminder booking, the group feed
  rooms.ts         Round rules + the queries and mutations the round screen uses
  telegram.ts      Bot webhook: commands, hangout cards, RSVP taps, reminders,
                   round scoreboards, initData verification, access grants
  lib.ts           Shared helpers + the access-token trust anchor
  foods.ts         Place-vs-craving classifier + your curated spots
  presence.ts      "who's here" heartbeat (round screen)
  http.ts          /telegram webhook route + presence leave beacon
src/
  pages/           Hangout, GroupPlans, Room, Landing, TgEntry (Mini App entry)
  components/      HangoutForm, RsvpButtons, GuestList, WhenPicker, Screen,
                   CollectView, OptionRow, SpinWheel, DecideView, ResultView,
                   ClosedView, Confetti, LoadingScreen, NoticeScreen
  components/ui/   shadcn/ui primitives (button, card, input, tabs, …)
  lib/             session (the access gate), telegram (Mini App bridge),
                   identity, types, hooks, ui, utils
```

### Scripts

| Command | Does |
| --- | --- |
| `npx convex dev` | Convex backend (watch + push) |
| `npm run dev` | Vite dev server for the Mini App (browser access is a dev convenience) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run lint` | ESLint (incl. `react-hooks` rules) |
