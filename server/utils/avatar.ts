export const getDefaultAvatarUrl = (name?: string, email?: string) => {
  const seed = String(name || email || "Movie Tracker User").trim() || "Movie Tracker User";
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
};

