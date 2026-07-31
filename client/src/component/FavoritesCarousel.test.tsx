import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import FavoritesCarousel from "./FavoritesCarousel";

// embla needs layout APIs jsdom doesn't provide; the carousel chrome isn't
// what these tests are about.
vi.mock("embla-carousel-react", () => ({
  default: () => [vi.fn(), undefined],
}));

const movie = (over: Record<string, unknown> = {}) => ({
  _id: "m1",
  title: "Power Ballad",
  poster: "/p.jpg",
  vote_average: 7,
  ...over,
});

const ME = "u1";
const me = { _id: ME, name: "Zad" };
const other = { _id: "u2", name: "Bea" };

describe("favorites carousel", () => {
  test("shows Remove only on the personal tab (no lovedBy)", () => {
    render(<FavoritesCarousel favorites={[movie()]} onRemoveFavorite={vi.fn()} />);

    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText(/Remove/)).toBeInTheDocument();
    expect(screen.queryByText(/Love it too/)).not.toBeInTheDocument();
  });

  test("shows Remove on a group tab when the viewer already loves it", () => {
    render(
      <FavoritesCarousel
        favorites={[movie({ lovedBy: [me, other] })]}
        currentUserId={ME}
        onRemoveFavorite={vi.fn()}
        onAddFavorite={vi.fn()}
      />
    );

    expect(screen.getByText(/Remove/)).toBeInTheDocument();
    expect(screen.queryByText(/Love it too/)).not.toBeInTheDocument();
  });

  test("offers 'Love it too' on a group tab when the viewer has not loved it", () => {
    render(
      <FavoritesCarousel
        favorites={[movie({ lovedBy: [other] })]}
        currentUserId={ME}
        onRemoveFavorite={vi.fn()}
        onAddFavorite={vi.fn()}
      />
    );

    expect(screen.getByText(/Love it too/)).toBeInTheDocument();
    expect(screen.queryByText(/Remove/)).not.toBeInTheDocument();
  });

  test("offers no action while the viewer is still unknown", () => {
    // Regression guard: the favorites endpoint toggles. If "Love it too"
    // rendered before `profile` loaded, clicking it on a movie the viewer
    // already loves would silently un-favorite it.
    render(
      <FavoritesCarousel
        favorites={[movie({ lovedBy: [me, other] })]}
        currentUserId={undefined}
        onRemoveFavorite={vi.fn()}
        onAddFavorite={vi.fn()}
      />
    );

    expect(screen.queryByText(/Love it too/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Remove/)).not.toBeInTheDocument();
    // ...but the aggregate context still renders.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("renders the group title and the loved-by count", () => {
    render(
      <FavoritesCarousel
        favorites={[movie({ lovedBy: [me, other] })]}
        title="What Movie Night Loves"
        currentUserId={ME}
        onRemoveFavorite={vi.fn()}
        onAddFavorite={vi.fn()}
      />
    );

    expect(screen.getByText("What Movie Night Loves")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("renders nothing when there are no favorites", () => {
    const { container } = render(
      <FavoritesCarousel favorites={[]} onRemoveFavorite={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
