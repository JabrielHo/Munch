import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isTelegram, tgStartParam, tgReady } from "../lib/telegram";
import { lastRoomCode } from "../lib/identity";
import { LoadingScreen } from "../components/LoadingScreen";

/**
 * The Mini App entry point — the URL registered with BotFather. Telegram opens
 * it with the room code riding in ?startapp=… (surfaced as start_param), so
 * this screen just dismisses Telegram's loader and forwards into the room.
 */
export default function TgEntry() {
  const navigate = useNavigate();

  useEffect(() => {
    tgReady();
    if (!isTelegram) return;
    if (tgStartParam) {
      navigate(`/r/${tgStartParam}`, { replace: true });
      return;
    }
    // Bare open (bot profile / direct link without startapp): land on the
    // history of the group this device last munched with.
    const last = lastRoomCode();
    if (last) navigate(`/h/${last}`, { replace: true });
  }, [navigate]);

  if (!isTelegram) {
    return (
      <div className="screen home">
        <div className="home-top">
          <div className="wordmark">Munch&nbsp;🍜</div>
          <div className="tagline">This door only opens from inside Telegram.</div>
        </div>
        <Link className="btn btn--block btn--lg" to="/">
          What is Munch?
        </Link>
      </div>
    );
  }

  // The effect above handles both navigations; this message is only for a
  // truly bare open on a device that has never had a room to remember.
  if (!tgStartParam && !lastRoomCode()) {
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

  return <LoadingScreen />;
}
