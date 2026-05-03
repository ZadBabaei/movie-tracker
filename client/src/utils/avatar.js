export const getDefaultAvatarUrl = (user = {}) => {
  const seed = String(user.name || user.email || user.username || user.id || user._id || "Movie Tracker User").trim() || "Movie Tracker User";
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
};

export const getAvatarUrl = (user = {}) => {
  return user.avatar || user.image || getDefaultAvatarUrl(user);
};

