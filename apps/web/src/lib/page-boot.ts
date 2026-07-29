/**
 * Page init for Astro View Transitions.
 * Fresh DOM on each navigation already has no ready flag — do not clear flags
 * (that caused duplicate async inits while the first was still running).
 */
export function registerPageBoot(
  selector: string,
  readyDatasetKey: string,
  boot: () => void,
): void {
  document.addEventListener("astro:page-load", boot);
  boot();
}
