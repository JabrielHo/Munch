# Munch 🍜 — _Stop asking. Start eating._

A Telegram bot + Mini App that helps your group chat decide where to eat —
**without leaving the conversation**. Someone sends `/munch`, everyone taps
**🎡 Open Munch** to add a place **or** a craving (like "ramen" or "chicken
rice") and vote, and the starter **spins the wheel** or **locks in the top
vote**. The winner lands right back in the chat.

- **The chat is the notice board** — the bot's message is a live scoreboard
  (auto-updated as votes come in) plus the winner announcement.
- **The Mini App is the room** — one button opens it over the chat: add, vote,
  and watch the wheel animate to the same result on every phone. No accounts,
  no name-typing; identity comes from Telegram.

## Tech stack

| Layer | Choice |
| --- | --- |
| Bot + backend | **Convex** — HTTP action webhook, reactive queries, scheduler |
| Mini App | **React + Vite + TypeScript** (no UI framework, hand-rolled CSS) |
| Hosting | **Cloudflare Pages** (Mini App static bundle) + Convex (backend) |

There is no auth stack: the bot verifies Telegram's webhook secret, and Mini
App host actions are verified against Telegram's signed `initData` (HMAC).

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
default) — the bot only needs commands and replies to its own messages.
Optionally register the command list with `/setcommands`:

```
munch - Start a round
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

**6. Add the bot to a group** and send `/munch`. 🎉

### How a round works

- `/munch [title]` — start a round (the sender becomes the host); the bot
  posts the scoreboard message
- Everyone taps **🎡 Open Munch** on that message: add options, vote, unvote —
  the chat scoreboard follows along (debounced, at most one edit per burst)
- The host spins the wheel 🎡 or locks the top pick 🔒 from inside the app;
  ending the round early lives there too
- The winner is announced in the chat, Maps link included
- A chat can run **several rounds at once** — every `/munch` starts a new one
  on its own live message (near-simultaneous `/munch`es merge into one round,
  so a race to start doesn't split the group). Rounds stay live until their
  host decides or ends them
- **🗂 All rounds** (inside the app) lists the group's whole history — live
  rounds and past outcomes, tap to open any. The starter can close their own
  round from there; anyone can close a round once it's a day old

---

## The Mini App (the wheel, inside Telegram)

The session message's **🎡 Open Munch** button opens the full Munch room —
live options, votes, and the synced spin wheel — as a Telegram Mini App layered
over the chat. Identity comes from Telegram (the same `tg:<user id>` the chat
buttons use), so there's no name gate, and host actions are verified
server-side against Telegram's signed `initData`.

> ⚠️ The Mini App is a hosted web page — Cloudflare Pages (or any static host)
> must keep serving the app for it to work.

**1. Register it** — in [@BotFather](https://t.me/BotFather): `/newapp`, pick
your bot, set the **Web App URL** to `https://your-domain.com/tg`, and choose a
short name (e.g. `munch`). That mints the direct link `https://t.me/YourBot/munch`.

**2. Tell the deployment about the link** (this switches the session-message
button from the plain web link to the Mini App):

```bash
npx convex env set TELEGRAM_MINIAPP_LINK https://t.me/YourBot/munch
```

The bot appends `?startapp=<room code>` per session; Telegram hands it back to
the app as `start_param`, and the `/tg` route forwards into the room.

**Mini App dev loop:** `npm run dev` serves the app at localhost, but Telegram
needs a public HTTPS URL — deploy to Pages (or tunnel) to test inside Telegram.
Outside Telegram the app still runs as a plain website: room links
(`/(your-domain)/r/CODE`) keep working for friends without Telegram (they just
pick a display name).

### Make the food suggestions real for your city

Open [`convex/foods.ts`](convex/foods.ts) and fill in the `spots` arrays, e.g.:

```ts
ramen: { emoji: "🍜", cuisine: "Japanese", spots: ["Ramen Keisuke", "Marutama"] },
```

Now when "ramen" wins, the bot's result message (and the Mini App result card)
suggests one of your spots and links to Maps. Add new foods/synonyms the same
way — no API key, works anywhere.

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
[`public/_redirects`](public/_redirects) makes `/tg` and `/r/ABC123` work on a
hard refresh.

### 3. Point your domain

Add your custom domain under the Pages project, set the BotFather **Web App
URL** to `https://your-domain.com/tg`, and set `SITE_URL` on the prod
deployment to match (it powers the web-link fallback button):

```bash
npx convex env set --prod SITE_URL https://your-domain.com
```

---

## Project layout

```
convex/            Backend: schema, room logic, Telegram bot, food classifier
  schema.ts        Tables: rooms, options, votes, presence
  rooms.ts         Shared room rules + the queries/mutations the room UI uses
  telegram.ts      Bot webhook: /munch sessions, live scoreboard message,
                   Mini App initData verification + host actions
  foods.ts         Place-vs-craving classifier + your curated spots
  presence.ts      "who's here" heartbeat (room screen)
  http.ts          /telegram webhook route + presence leave beacon
src/
  pages/           Landing, Room, TgEntry (Mini App entry)
  components/      CollectView, OptionRow, SpinWheel, DecideView, ResultView, …
  lib/             telegram (Mini App bridge), identity, hooks, ui
```

### Scripts

| Command | Does |
| --- | --- |
| `npx convex dev` | Convex backend (watch + push) |
| `npm run dev` | Vite dev server (Mini App / web room) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run lint` | ESLint (incl. `react-hooks` rules) |
