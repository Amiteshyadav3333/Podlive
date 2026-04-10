"use client";

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_BASE_URL = (
  configuredApiBaseUrl && configuredApiBaseUrl.length > 0
    ? configuredApiBaseUrl
    : "http://localhost:5005"
).replace(/\/+$/, "");

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getSocketUrl() {
  return API_BASE_URL;
}

export function getLiveKitWsUrl() {
  const configuredLiveKitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  if (configuredLiveKitUrl) {
    return configuredLiveKitUrl.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "";
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:7880`;
}
