import { themes } from "../content/themes.js";
const themeByKey = Object.fromEntries(
  themes.map((theme) => [theme.key, theme]),
);

const base = import.meta.env.BASE_URL;
const stage = document.getElementById("theme-stage");
if (stage) {
  const image = document.getElementById("active-theme-image");
  const name = document.getElementById("active-theme-name");
  const caption = document.getElementById("active-theme-caption");
  for (const button of stage.querySelectorAll("[data-theme]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.theme;
      if (!Object.hasOwn(themeByKey, key)) return;
      stage.dataset.theme = key;
      name.textContent = themeByKey[key].name;
      caption.textContent = themeByKey[key].description;
      image.src = `${base}assets/screens/board-${key}.webp`;
      image.alt = `Stimmyz soundboard in ${themeByKey[key].name} theme`;
      stage.querySelectorAll("[data-theme]").forEach((choice) => {
        choice.classList.toggle("selected", choice === button);
        choice.setAttribute("aria-pressed", String(choice === button));
      });
    });
  }
}

const toggle = document.querySelector(".mobile-nav-toggle");
const menu = document.getElementById("nav-links");
if (toggle && menu) {
  const setMenuOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("open", open);
  };
  toggle.addEventListener("click", () =>
    setMenuOpen(toggle.getAttribute("aria-expanded") !== "true"),
  );
  menu
    .querySelectorAll("a")
    .forEach((link) =>
      link.addEventListener("click", () => setMenuOpen(false)),
    );
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggle.getAttribute("aria-expanded") === "true"
    ) {
      setMenuOpen(false);
      toggle.focus();
    }
  });
}
