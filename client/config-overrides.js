module.exports = function override(config, env) {
  if (env === "production") {
    try {
      config.plugins.push(require("babel-plugin-transform-remove-console"));
    } catch {
      console.warn("babel-plugin-transform-remove-console is not installed; keeping console calls in production build.");
    }
  }
  return config;
};
