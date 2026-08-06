// The app is one client-side page. Nothing about it is user-specific on the
// server, the prerendered shell is what the service worker will cache (§14),
// and prerendering keeps page loads off the function budget entirely. Only
// /api/* is dynamic.
export const prerender = true;
