/** Shared theme toggle — loaded once from BaseLayout. */
function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
}

document.addEventListener("click", (event) => {
  const pick = (event.target as Element | null)?.closest<HTMLElement>("[data-theme-pick]");
  if (pick) {
    applyTheme(pick.dataset.themePick === "dark");
    return;
  }

  const toggle = (event.target as Element | null)?.closest("[data-theme-toggle]");
  if (toggle) {
    applyTheme(!document.documentElement.classList.contains("dark"));
  }
});
