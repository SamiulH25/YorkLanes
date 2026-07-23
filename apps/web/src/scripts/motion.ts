/** Scroll-reveal animations for elements with .motion-on-scroll */
function initScrollReveals(): void {
  document.querySelectorAll(".motion-on-scroll:not(.is-visible)").forEach((node) => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" },
    );
    observer.observe(node);
  });
}

document.addEventListener("astro:page-load", initScrollReveals);
initScrollReveals();
