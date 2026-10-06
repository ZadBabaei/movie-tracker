// Shared settings for the static, indexable public pages (see ./pages.ts).

export const SITE_ORIGIN = "https://movietrk.com";
export const SITE_NAME = "Movie Tracker";

// Shared social preview image (1200x630), served from client/public.
export const OG_IMAGE = {
  path: "/og/movie-tracker.png",
  width: 1200,
  height: 630,
  alt: "Movie Tracker — track movies, TV episodes and movie nights",
};

// Header logo, served from client/public.
export const HEADER_LOGO = {
  path: "/brand/movie-tracker-logo-440.webp",
  width: 440,
  height: 147,
};

// Public contact address for privacy and account requests. Leave empty until a
// monitored mailbox exists; the pages fall back to wording without an address.
export const CONTACT_EMAIL = "";

export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path === "/" ? "/" : path}`;
