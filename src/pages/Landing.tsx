/**
 * The web root is just a signpost — Munch lives in Telegram. The hosted site
 * exists to serve the Mini App; there is no standalone web experience.
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
    </div>
  );
}
