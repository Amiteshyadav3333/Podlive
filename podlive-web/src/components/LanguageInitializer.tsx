"use client";

import { useEffect } from "react";
import { detectLanguage } from "@/lib/language";

export default function LanguageInitializer() {
  useEffect(() => {
    const language = detectLanguage();
    document.documentElement.lang = language;
  }, []);
  return null;
}
