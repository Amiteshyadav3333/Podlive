"use client";

import { useEffect } from "react";

export default function LanguageInitializer() {
  useEffect(() => {
    const language = localStorage.getItem("podliveLanguage") || "hi";
    localStorage.setItem("podliveLanguage", language);
    document.documentElement.lang = language;
  }, []);
  return null;
}
