import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isTelegram, startParam, markAppReady } from "../lib/telegram";
import { lastRoomCode } from "../lib/identity";
import { LoadingScreen } from "../components/LoadingScreen";

/**
 * The Mini App entry point — the URL registered with BotFather. Telegram opens
 * it with the room code riding in ?startapp=…, so this screen exists only to
 * forward into the room.
 */
export default function TgEntry() {
  const navigate = useNavigate();

  useEffect(() => {
    markAppReady();
    if (!isTelegram) return;
    if (startParam) {
      navigate(`/r/${startParam}`, { replace: true });
      return;
    }
    // Opened without a room code (from the bot profile or a direct link): land
    // on the history of whichever group this device last munched with.
    const previousRoom = lastRoomCode();
    if (previousRoom) navigate(`/h/${previousRoom}`, { replace: true });
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

  // The effect above handles both navigations, so this only shows on a device
  // that has never had a room to remember.
  if (!startParam && !lastRoomCode()) {
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
