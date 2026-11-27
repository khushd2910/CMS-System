// Decides where to send a person right after they sign in.
//
// `from` is the page they were trying to open before the login screen interrupted them (React Router puts it in
// location.state.from; it is an object with pathname, search and hash). We only trust it when it is safe:
//   - it is a path on THIS site ("/something", never "//other-site.com" or "https://...")
//   - it belongs to the area of the portal this person signs in to (prefix, e.g. "/admin")
//   - it is not itself a login / register page (that would send them in a circle)
// Anything else falls back to the role's normal home page.

const AUTH_PAGES = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];

function isAuthPage(pathname) {
  return AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`)) || pathname.endsWith("/login");
}

export function redirectTarget(from, { prefix, fallback }) {
  if (!from || typeof from !== "object") return fallback;
  const { pathname, search = "", hash = "" } = from;
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\")) {
    return fallback;
  }
  // "/admin" matches "/admin" and "/admin/dashboard", but NOT "/administrator".
  if (prefix && pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return fallback;
  if (isAuthPage(pathname)) return fallback;
  return `${pathname}${search}${hash}`;
}
