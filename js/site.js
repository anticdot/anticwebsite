const menuButton = document.querySelector("#mobileMenu");
const navLinks = document.querySelector(".links");
menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  menuButton.setAttribute("aria-label", expanded ? "Menü öffnen" : "Menü schließen");
  navLinks?.classList.toggle("open", !expanded);
});

const previewCard = document.querySelector(".device");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (previewCard && !reducedMotion.matches) {
  previewCard.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const bounds = previewCard.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5));

    previewCard.style.setProperty("--tilt-x", `${(-y * 12).toFixed(2)}deg`);
    previewCard.style.setProperty("--tilt-y", `${(x * 14).toFixed(2)}deg`);
    previewCard.style.setProperty("--move-x", `${(x * 12).toFixed(2)}px`);
    previewCard.style.setProperty("--move-y", `${(y * 10).toFixed(2)}px`);
    previewCard.style.setProperty("--lift", "-8px");
  });

  previewCard.addEventListener("pointerleave", () => {
    for (const property of ["--tilt-x", "--tilt-y", "--move-x", "--move-y", "--lift"]) {
      previewCard.style.removeProperty(property);
    }
  });
}
