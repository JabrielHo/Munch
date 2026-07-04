/**
 * The web root is just a signpost now — Munch lives in Telegram. Room links
 * (/r/<code>) still work for guests without Telegram; everything else happens
 * in the group chat and the Mini App.
 */
export default function Landing() {
  // Optional: set VITE_TELEGRAM_BOT_LINK (e.g. https://t.me/YourMunchBot) at
  // build time to render a button straight to the bot.
  const botLink = import.meta.env.VITE_TELEGRAM_BOT_LINK;

  return (
    <div className="screen home">
      <div className="home-top">
        <div className="wordmark">Munch&nbsp;🍜</div>
        <div className="tagline">
          Munch lives in Telegram now. Add the bot to your group chat, send <b>/munch</b>, and
          decide where to eat without leaving the conversation.
        </div>
      </div>
      {botLink && (
        <a className="btn btn--block btn--lg" href={botLink}>
          Open the bot in Telegram
        </a>
      )}
      <p className="muted">Got a room link from a friend? Just open it — that still works.</p>
    </div>
  );
}
