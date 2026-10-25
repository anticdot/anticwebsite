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
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (preview && previewCard && finePointer.matches && !reducedMotion.matches) {
  preview.addEventListener("pointermove", (event) => {
    const bounds = preview.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    previewCard.style.setProperty("--tilt-x", `${(-y * 5).toFixed(2)}deg`);
    previewCard.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
    previewCard.style.setProperty("--lift", "-5px");
  });

  preview.addEventListener("pointerleave", () => {
    previewCard.style.removeProperty("--tilt-x");
    previewCard.style.removeProperty("--tilt-y");
    previewCard.style.removeProperty("--lift");
  });
}
