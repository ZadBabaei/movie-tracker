
const dev = import.meta.env.DEV;

export const log = (...args) => {
  if (dev) console.log(...args);
};

export const warn = (...args) => {
  if (dev) console.warn(...args);
};

export const error = (...args) => {
  if (dev) console.error(...args);
};
