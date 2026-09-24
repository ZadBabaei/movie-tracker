const IMDB_TITLE_ID_PATTERN = /^tt\d{7,12}$/i;

export const isValidImdbTitleId = (value: string): boolean =>
  IMDB_TITLE_ID_PATTERN.test(value);

export const normalizeImdbTitleId = (value: string): string | null =>
  isValidImdbTitleId(value) ? value.toLowerCase() : null;
