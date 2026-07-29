/**
 * Reliable page init for Astro View Transitions.
 *
 * Working pages (plan, sidebar) call boot at module load AND on astro:page-load.
 * Pages that only listened for astro:page-load often never initialized.
 */
export function registerPageBoot(
  selector: string,
  readyDatasetKey: string,
  boot: () => void,
): void {
  function clearReadyFlags(): void {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      delete element.dataset[readyDatasetKey];
    });
  }

  function runBoot(): void {
    boot();
  }

  document.addEventListener("astro:page-load", () => {
    clearReadyFlags();
    runBoot();
  });

  runBoot();
}
