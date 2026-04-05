import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "furnicore_access_token";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Initialize the custom fetch auth token getter
setAuthTokenGetter(() => {
  return getAuthToken();
});
