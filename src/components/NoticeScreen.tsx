import { Link } from "react-router-dom";

/** A full-screen dead end — round not found, or access denied. */
export function NoticeScreen({ message }: { message: string }) {
  return (
    <div className="screen home">
      <div className="home-top">
        <div className="wordmark">Munch&nbsp;🍜</div>
        <div className="tagline">{message}</div>
      </div>
      <Link className="btn btn--block btn--lg" to="/">
        What is Munch?
      </Link>
    </div>
  );
}
