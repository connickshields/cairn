const KEY = "cairn-api-password";

function getPassword(): string {
  let pw = localStorage.getItem(KEY);
  if (pw === null) {
    pw = window.prompt("Access password for cairn") ?? "";
    if (pw) localStorage.setItem(KEY, pw);
  }
  return pw;
}

export function clearApiPassword(): void {
  localStorage.removeItem(KEY);
}

// fetch wrapper for /api/* calls: attaches HTTP Basic auth (empty username + the stored
// password) and, on a 401, clears the stored password so the user is re-prompted.
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Basic " + btoa(":" + getPassword()));
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearApiPassword();
    throw new Error("Unauthorized — wrong access password. Reload and try again.");
  }
  return res;
}
