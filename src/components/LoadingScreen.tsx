/** Full-screen spinner shown while a page's query is still loading. */
export function LoadingScreen() {
  return (
    <div className="screen">
      <div className="loading">
        <div className="spinner" />
      </div>
    </div>
  );
}
