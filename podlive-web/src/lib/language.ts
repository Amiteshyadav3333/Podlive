export type SupportedLanguage = "hi" | "en";

export function detectLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "hi";
  const manuallySelected = localStorage.getItem("podliveLanguageSource") === "manual";
  const saved = localStorage.getItem("podliveLanguage");
  if (manuallySelected && (saved === "hi" || saved === "en")) return saved;
  const deviceLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return deviceLanguages.some(language => language.toLowerCase().startsWith("hi")) ? "hi" : "en";
}

export function saveLanguage(language: SupportedLanguage) {
  localStorage.setItem("podliveLanguage", language);
  localStorage.setItem("podliveLanguageSource", "manual");
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent("podlive-language-change", { detail: language }));
}
