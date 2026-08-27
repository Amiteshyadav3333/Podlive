export type SupportedLanguage = "hi" | "en";

export function detectLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  const manuallySelected = localStorage.getItem("podliveLanguageSource") === "manual";
  const saved = localStorage.getItem("podliveLanguage");
  if (manuallySelected && (saved === "hi" || saved === "en")) return saved;
  return "en";
}

export function saveLanguage(language: SupportedLanguage) {
  localStorage.setItem("podliveLanguage", language);
  localStorage.setItem("podliveLanguageSource", "manual");
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent("podlive-language-change", { detail: language }));
}
