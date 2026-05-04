export const getDefaultAvatarUrl = (user = {}) => {
  const seed = String(user.name || user.email || user.username || user.id || user._id || "Movie Tracker User").trim() || "Movie Tracker User";
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
};

export const getAvatarUrl = (user = {}) => {
  const avatar = String(user.avatar || "").trim();
  const image = String(user.image || "").trim();
  return avatar || image || getDefaultAvatarUrl(user);
};

export const handleAvatarError = (event, user = {}) => {
  const fallbackUrl = getDefaultAvatarUrl(user);
  if (event.currentTarget.src !== fallbackUrl) {
    event.currentTarget.src = fallbackUrl;
  }
};

export const getDefaultGroupAvatarUrl = (group = {}) => {
  const seed = String(group.name || group.groupName || group.id || group._id || group.groupId || "movie-circle").trim() || "movie-circle";
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed)}`;
};

export const getGroupAvatarUrl = (group = {}) => {
  const avatar = String(group.avatar || group.image || group.groupAvatar || "").trim();
  return avatar || getDefaultGroupAvatarUrl(group);
};

export const handleGroupAvatarError = (event, group = {}) => {
  const fallbackUrl = getDefaultGroupAvatarUrl(group);
  if (event.currentTarget.src !== fallbackUrl) {
    event.currentTarget.src = fallbackUrl;
  }
};
