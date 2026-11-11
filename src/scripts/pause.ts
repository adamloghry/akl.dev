// pause.ts: mark the forest and the moon while the document is hidden (background tab, minimised or occluded window).
// overrides.css pauses only the infinite animations (gust, sway, rain, moon drift) under that class. The one-shot
// grow-in and ridge reveal keep running on wall-clock time, so the stand finishes growing while the tab is away and
// a resize rebuild's --age (seconds since load) stays true. See docs/design.md section 3.
export function pauseWhenHidden(...els: Element[]): void {
  const sync = () => {
    const hidden = document.visibilityState === 'hidden';
    for (const el of els) el.classList.toggle('tab-hidden', hidden);
  };
  sync(); // a page can be opened straight into a background tab
  document.addEventListener('visibilitychange', sync);
}
