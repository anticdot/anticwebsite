const menuButton = document.querySelector("#mobileMenu");
const navLinks = document.querySelector(".links");
menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  menuButton.setAttribute("aria-label", expanded ? "Menü öffnen" : "Menü schließen");
  navLinks?.classList.toggle("open", !expanded);
});

const preview = document.querySelector(".visual");
const previewCard = document.querySelector(".device");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (preview && previewCard && !reducedMotion.matches) {
  preview.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const bounds = previewCard.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5));

    previewCard.style.setProperty("--tilt-x", `${(-y * 9).toFixed(2)}deg`);
    previewCard.style.setProperty("--tilt-y", `${(x * 11).toFixed(2)}deg`);
    previewCard.style.setProperty("--move-x", `${(x * 20).toFixed(2)}px`);
    previewCard.style.setProperty("--move-y", `${(y * 16).toFixed(2)}px`);
    previewCard.style.setProperty("--lift", "-8px");
    previewCard.style.setProperty("--card-scale", "1.015");
    previewCard.style.setProperty("--pointer-x", `${((x + 0.5) * 100).toFixed(1)}%`);
    previewCard.style.setProperty("--pointer-y", `${((y + 0.5) * 100).toFixed(1)}%`);
    previewCard.classList.add("is-following");
  });

  preview.addEventListener("pointerleave", () => {
    previewCard.classList.remove("is-following");
    for (const property of ["--tilt-x", "--tilt-y", "--move-x", "--move-y", "--lift", "--card-scale", "--pointer-x", "--pointer-y"]) {
      previewCard.style.removeProperty(property);
    }
  });
}
