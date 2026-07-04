# Munch 🍜 — _Stop asking. Start eating._

A dead-simple web app that helps your friends decide where to eat. One person
starts a room, drops the link in the group chat, everyone adds a place **or** a
craving (like "ramen" or "chicken rice"), and then the host **spins a wheel** or
**locks in the top vote**. Everyone watches the same result land live.

- **Minimal & intuitive** — no app to install, friends just open the link and tap.
- **Only the host signs in.** Friends join anonymously; they just pick a name.
- **Real-time** — options, votes, and the spin sync instantly across phones.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | **React + Vite + TypeScript** (no UI framework, hand-rolled CSS) |
| Backend / DB | **Convex** — reactive queries push live updates, no polling |
| Auth | **Convex Auth** (email + password) — host only |
| Hosting | **Cloudflare Pages** (static SPA) + Convex (backend) |

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
changes. Using a cloud dev deployment (rather than a purely local one) means the
shareable link already works on your friends' phones while you're developing.

> A local-only deployment also works for solo testing (`npx convex dev` →
> "without an account"), but the `/r/CODE` link won't reach other devices.

**3. Set up the host login keys** (one time, per deployment)

Convex Auth needs an RS256 keypair in your deployment's env vars:

```bash
node scripts/generate-auth-keys.mjs
npx convex env set -- JWT_PRIVATE_KEY "$(cat .auth-keys/jwt_private_key.txt)"
npx convex env set -- JWKS "$(cat .auth-keys/jwks.json)"
npx convex env set SITE_URL http://localhost:5173
```

(`.auth-keys/` is git-ignored — never commit it.) Prefer a guided setup? The
official `npx @convex-dev/auth` does the same thing interactively.

**4. Start the web app** (in a second terminal)

```bash
npm run dev
```

Open the printed URL (e.g. http://localhost:5173). Click **Start a room**,
create a host account (name + email + password), and you're in. Your name lives
on the account, so it follows you to any browser you sign in on. Friends only
ever need the link — there's no code to type and no account to make.

---

## How it works

- **Host** taps _Start a room_ → signs in → gets a room with a code and a
  shareable link `/(your-domain)/r/CODE`.
- **Friends** open the link, see the live list immediately, and are asked for a
  name the first time they add or vote (never a blocking wall).
- **Adding** an option auto-classifies it: a specific place keeps its name; a
  generic craving ("tacos") gets an emoji + cuisine tag, and — if you've curated
  local spots — a "try: …" suggestion.
- **Deciding**: the host either **🎡 Spin the wheel** (random, fun) or **🔒 Lock
  top pick** (most votes). The winner + wheel angle are computed on the server so
  every phone animates to the _same_ result.

### Make the food suggestions real for your city

Open [`convex/foods.ts`](convex/foods.ts) and fill in the `spots` arrays, e.g.:

```ts
ramen: { emoji: "🍜", cuisine: "Japanese", spots: ["Ramen Keisuke", "Marutama"] },
```

Now when "ramen" wins, the result card suggests one of your spots and links to
Maps. Add new foods/synonyms the same way — no API key, works anywhere.

---

## Deploy

### 1. Push the backend to production

```bash
npx convex deploy
```

Then set the env vars on your **production** deployment (a fresh keypair — env
vars don't carry over between deployments):

```bash
node scripts/generate-auth-keys.mjs
npx convex env set --prod -- JWT_PRIVATE_KEY "$(cat .auth-keys/jwt_private_key.txt)"
npx convex env set --prod -- JWKS "$(cat .auth-keys/jwks.json)"
npx convex env set --prod SITE_URL https://your-domain.com
```

### 2. Deploy the frontend to Cloudflare Pages

Connect the repo in the Cloudflare Pages dashboard, then set:

- **Build command:** `npx convex deploy --cmd 'npm run build'`
- **Build output directory:** `dist`
- **Environment variable:** `CONVEX_DEPLOY_KEY` — generate it in the Convex
  dashboard (_Settings → Deploy keys → Production_).

That single build command deploys your Convex functions **and** builds the
frontend with the correct `VITE_CONVEX_URL` baked in. The included
[`public/_redirects`](public/_redirects) makes deep links like `/r/ABC123` work
on a hard refresh.

### 3. Point your domain

Add your custom domain under the Pages project, then update the production
`SITE_URL` (above) to match. Share the link — that's it. 🎉

---

## Telegram bot 🤖

Munch also runs **inside a Telegram group chat** — no link-hopping: the chat is
the room, votes are buttons, and the result lands as a message.

- `/munch [title]` — start a round (the sender becomes the host)
- `/add ramen` — add an option (or just **reply** to the munch message)
- Tap an option's button to vote; tap again to unvote
- `/spin` 🎡 / `/lock` 🔒 / `/end` — host-only, same rules as the web app

Telegram rooms are ordinary rooms under the hood (participants are
`tg:<user id>` clients), so every session also gets a **web link button** —
the bridge to opening the same room in the browser or a future Mini App.

### Set it up (one time, per deployment)

**1. Create the bot** — talk to [@BotFather](https://t.me/BotFather): `/newbot`,
pick a name and username, copy the token. Leave **group privacy ON** (the
default) — the bot only needs commands and replies to its own messages.
Optionally register the command list with `/setcommands`:

```
munch - Start a round
add - Add a place or craving
remove - Remove an option you added
spin - Spin the wheel (host)
lock - Lock the top pick (host)
end - Close the round (host)
help - How it works
```

**2. Give the deployment the token + a webhook secret** (any long random
string — it's how we know updates really come from Telegram):

```bash
npx convex env set TELEGRAM_BOT_TOKEN 123456789:AA...your-token
npx convex env set TELEGRAM_WEBHOOK_SECRET some-long-random-string
```

**3. Point Telegram at your deployment.** HTTP actions are served on the
`.convex.site` domain (not `.convex.cloud` — check the Convex dashboard for
your exact URL):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-deployment.convex.site/telegram" \
  -d "secret_token=some-long-random-string"
```

**4. Add the bot to your group** and send `/munch`. That's it — for production,
repeat steps 2–3 with `--prod` env vars and the prod `.convex.site` URL.

### The Mini App (the wheel, inside Telegram)

The session message's **🎡 Open Munch** button opens the full Munch room —
live options, votes, and the synced spin wheel — as a Telegram Mini App layered
over the chat. No accounts, no name gate: identity comes from Telegram
(the same `tg:<user id>` the chat buttons use), and host actions are verified
server-side against Telegram's signed `initData`.

> ⚠️ The Mini App is still a hosted web page — Cloudflare Pages (or any static
> host) must keep serving the app for it to work. "Decommissioning the web app"
> means retiring the standalone site experience, not the hosting.

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

---

## Project layout

```
convex/            Backend: schema, room logic, food classifier, auth, presence
  schema.ts        Tables: rooms, options, votes, presence (+ auth tables)
  rooms.ts         All queries + mutations (create/add/vote/spin/lock/reset)
  telegram.ts      Telegram bot: /munch sessions, vote buttons, spin/lock
  foods.ts         Place-vs-craving classifier + your curated spots
  presence.ts      "who's here" heartbeat
src/
  pages/           Home, Room
  components/       CollectView, OptionRow, SpinWheel, DecideView, ResultView, …
  lib/             identity (clientId + name), hooks (clipboard, reduced-motion), ui
scripts/           generate-auth-keys.mjs
```

### Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npx convex dev` | Convex backend (watch + push) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run lint` | ESLint (incl. `react-hooks` rules) |
