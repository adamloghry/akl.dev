// gust.ts: the wind gust sweeps across the stand from the left (docs/design.md section 3).
// The lean itself is CSS (overrides.css). This only sets delays: --gx on every tree wrapper, its time for the
// gust front to reach the wrapper's x position, and on the rain the mid-sweep time plus the stand's --age.

/** Screen speed of the gust front in px/s, so a wide window takes longer to cross than a phone. */
export const GUST_SPEED = 800;

export function sweepGust(stand: HTMLElement, rain: HTMLElement, speed = GUST_SPEED): void {
  // The stand spans the window width on screen at any --fs, so a wrapper's left % is its screen x.
  const cross = innerWidth / speed;
  for (const w of stand.querySelectorAll<HTMLElement>('.tw')) {
    w.style.setProperty('--gx', ((parseFloat(w.style.left) / 100) * cross).toFixed(2) + 's');
  }
  rain.style.setProperty('--gx', (cross / 2).toFixed(2) + 's');
  rain.style.setProperty('--age', stand.style.getPropertyValue('--age'));
}
