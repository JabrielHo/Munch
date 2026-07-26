/** The web root is just a signpost — the hosted site exists to serve the Mini
 *  App, and there is no standalone web experience. */
export default function Landing() {
  // Set VITE_TELEGRAM_BOT_LINK at build time to render a button to the bot.
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
