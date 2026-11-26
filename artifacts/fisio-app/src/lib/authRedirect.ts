export function protectedRedirect(pathname: string, search = "", hash = ""): string {
  const destination = `${pathname}${search}${hash}`;
  return destination.startsWith("/") ? destination : `/${destination}`;
}

export function signInRedirectUrl(pathname: string, search = "", hash = ""): string {
  return `/sign-in?redirect=${encodeURIComponent(protectedRedirect(pathname, search, hash))}`;
}

export function localReturnPath(value: string | null, fallback: string): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  const url = new URL(value, "https://app.invalid");
  if (url.origin !== "https://app.invalid" || /^\/(sign-in|sign-up|auth)(\/|$)/.test(url.pathname)) return fallback;
  return url.pathname + url.search + url.hash;
}
