export function protectedRedirect(pathname: string, search = "", hash = ""): string {
  const destination = `${pathname}${search}${hash}`;
  return destination.startsWith("/") ? destination : `/${destination}`;
}

export function signInRedirectUrl(pathname: string, search = "", hash = ""): string {
  return `/sign-in?redirect=${encodeURIComponent(protectedRedirect(pathname, search, hash))}`;
}