import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isTelegram, tgStartParam, tgReady } from "../lib/telegram";

/**
 * The Mini App entry point — the URL registered with BotFather. Telegram opens
 * it with the room code riding in ?startapp=… (surfaced as start_param), so
 * this screen just dismisses Telegram's loader and forwards into the room.
 */
export default function TgEntry() {
  const navigate = useNavigate();

  useEffect(() => {
    tgReady();
    if (isTelegram && tgStartParam) {
      navigate(`/r/${tgStartParam}`, { replace: true });
    }
  }, [navigate]);

  if (!isTelegram) {
    return (
      <div className="screen home">
        <div className="home-top">
          <div className="wordmark">Munch&nbsp;🍜</div>
          <div className="tagline">This door only opens from inside Telegram.</div>
        </div>
        <Link className="btn btn--block btn--lg" to="/">
          Go to the web app
        </Link>
      </div>
    );
  }

  if (!tgStartParam) {
    return (
      <div className="screen home">
        <div className="home-top">
          <div className="wordmark">Munch&nbsp;🍜</div>
          <div className="tagline">
            No round in flight — send <b>/munch</b> in your group chat, then tap the button on the
            bot's message.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="loading">
        <div className="spinner" />
      </div>
    </div>
  );
}
