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

/**
 * Fetches the LiveKit WebSocket URL securely from the backend.
 * The URL is NEVER stored in frontend env vars or hardcoded in the bundle.
 * The backend reads it from its own .env and serves only the WS URL (no secrets).
 */
export async function fetchLiveKitWsUrl(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/config`);
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data.livekitUrl) throw new Error("livekitUrl missing in config response");
    return data.livekitUrl.replace(/\/+$/, "");
  } catch (err) {
    console.error("[PodLive] Failed to fetch LiveKit config from backend:", err);
    return "";
  }
}
