export interface TestUserInput {
  name: string;
  email: string;
  password: string;
}

export const uniqueRunId = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createUserFactory = (runId = uniqueRunId()) => ({
  runId,
  user(index: number): TestUserInput {
    return {
      name: `E2E User ${index}`,
      email: `${runId}-user-${index}@example.com`,
      password: "E2E-password-123!",
    };
  },
  users(count = 20): TestUserInput[] {
    return Array.from({ length: count }, (_, index) => this.user(index + 1));
  },
});

export const testMovie = {
  imdbID: "tmdb-24",
  title: "Kill Bill: Vol. 1",
  poster_path: "https://image.tmdb.org/t/p/w500/v7TaX8kXMXs5yFFGR41guUDNcnB.jpg",
  vote_average: 8.0,
};

export const pollMovies = [
  {
    tmdbId: "11",
    id: "11",
    title: "Star Wars",
    poster_path: "/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg",
    vote_average: 8.2,
  },
  {
    tmdbId: "13",
    id: "13",
    title: "Forrest Gump",
    poster_path: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    vote_average: 8.5,
  },
];
