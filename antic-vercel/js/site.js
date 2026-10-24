const menuButton = document.querySelector("#mobileMenu");
const navLinks = document.querySelector(".links");
menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  menuButton.setAttribute("aria-label", expanded ? "Menü öffnen" : "Menü schließen");
  navLinks?.classList.toggle("open", !expanded);
});
