/** Where the authoritative server lives. Local dev uses the Vite proxy. */

const LOCAL_PORTS = new Set(["5183", "5173", "3000", "3091"]);

export function serverOrigin() {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || LOCAL_PORTS.has(window.location.port)) {
    return "";
  }
  return "https://13-202-16-144.sslip.io";
}
