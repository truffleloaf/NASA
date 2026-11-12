export function MoonFallback() {
  return (
    <div className="moon-fallback" aria-hidden="true">
      <div className="landing-moon" />
      <div className="moon-site">
        <span className="site-dot" />
        <span>
          Shackleton region<small>South-pole candidate</small>
        </span>
      </div>
      <span className="fallback-earth" title="Earth · Illustrative" />
      <span className="fallback-sun" title="Sun · Illustrative" />
    </div>
  );
}
