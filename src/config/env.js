function mustBeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export const frontendEnv = Object.freeze({
  apiUrl: mustBeString(import.meta.env.VITE_API_URL, ""),
  basePath: mustBeString(import.meta.env.BASE_PATH, "/"),
  mode: mustBeString(import.meta.env.MODE, "development"),
  isProd: import.meta.env.PROD === true,
  isDev: import.meta.env.DEV === true,
});

export function getFrontendApiUrl() {
  return frontendEnv.apiUrl;
}
