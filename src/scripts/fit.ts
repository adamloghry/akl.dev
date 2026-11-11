// fit.ts: the stand's scale, mirroring fitStand() in forest.js except for the cap (docs/design.md section 3).
// forest.js stays byte-identical to the handoff reference (AC-REF-1), so the owner-approved change lives here.
// The handoff caps --fs at 1, which leaves a tall window (2560x1440, 4K) with the forest in its bottom third and an
// empty band above the treetops. Above 1 the stand grows into that band, up to MAX_FS. Windows at or below
// 1920x1080 already fit at fs < 1 and are unchanged. The floor and the sink below the viewport are the handoff's.
import { DEFAULT_CONFIG } from './forest.js';

export const MAX_FS = 1.5;

/** Scale the stand so the near layer stays below the text in the first viewport. Sets --fs and returns it. */
export function fitStandTall(stand: HTMLElement, mainEl: Element, cfg: { forestHeight: number } = DEFAULT_CONFIG): number {
  const mb = mainEl.getBoundingClientRect();
  const avail = window.innerHeight - (mb.bottom + window.scrollY) - 24;
  const fs = Math.max(0.35, Math.min(MAX_FS, avail / cfg.forestHeight));
  stand.style.setProperty('--fs', fs.toFixed(3));
  // At the scale floor the stand can still be taller than the room under the text: sink it below the
  // viewport (.forest clips) so near trees never cross the text; only the faint giants may pass behind it.
  stand.style.bottom = Math.min(0, avail - fs * cfg.forestHeight).toFixed(0) + 'px';
  return fs;
}
