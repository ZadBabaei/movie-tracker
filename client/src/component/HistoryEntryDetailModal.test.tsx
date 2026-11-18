import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import HistoryEntryDetailModal from "./HistoryEntryDetailModal";

const historyApi = vi.hoisted(() => ({
  fetchPersonalHistory: vi.fn(),
  fetchGroupHistory: vi.fn(),
  updateHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  rateHistoryEntry: vi.fn(),
}));
const groupApi = vi.hoisted(() => ({ fetchGroupMembers: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warn: vi.fn() }));

vi.mock("react-toastify", () => ({ toast: toastMock }));
vi.mock("../api/historyApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/historyApi")>();
  return { ...actual, ...historyApi };
});
vi.mock("../api/groupApi", () => groupApi);

const zad = { _id: "u1", name: "Zad", avatar: "" };
const sam = { _id: "u2", name: "Sam", avatar: "" };
const kim = { _id: "u3", name: "Kim", avatar: "" };
const GROUP = { _id: "g1", name: "Movie Club", slug: "movie-club" };

const base = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  _id: "h1",
  mediaType: "movie",
  scope: "group",
  group: GROUP,
  createdBy: zad,
  movie: { _id: "m1", title: "Arrival", imdbID: "tmdb-329865", poster: "", vote_average: 7.9 },
  tv: null,
  participants: [zad, sam],
  watchedAt: "2026-09-19T00:00:00.000Z",
  watchedLocation: "Cinema",
  watchedNotes: "Loved it",
  averageRating: null,
  ratingCount: 0,
  currentUserRating: null,
  ratings: [],
  ...overrides,
});

const episode = (overrides: Partial<HistoryEntry> = {}) =>
  base({
    _id: "h-ep",
    mediaType: "tv_episode",
    movie: null,
    tv: {
      seriesTmdbId: 1,
      seasonNumber: 1,
      episodeNumber: 6,
      episodeTmdbId: 16,
      seriesTitle: "East of Eden",
      episodeTitle: "Episode 6",
      posterPath: "",
      backdropPath: "",
      stillPath: "",
      airDate: null,
    },
    ...overrides,
  });

/** Mirrors the pages: the modal is re-fed the server's copy after a save. */
const Harness = ({ initial }: { initial: HistoryEntry }) => {
  const [entry, setEntry] = useState<HistoryEntry | null>(initial);
  return <HistoryEntryDetailModal entry={entry} onClose={() => setEntry(null)} onUpdated={setEntry} />;
};

const openEditor = async () => {
  const dialog = await screen.findByRole("dialog", { name: /watch history details/i });
  fireEvent.click(within(dialog).getByRole("button", { name: /edit details/i }));
  return dialog;
};

const chip = (dialog: HTMLElement, name: string) =>
  within(within(dialog).getByTestId("edit-participants")).getByRole("button", { name: new RegExp(name) });

beforeEach(() => {
  Object.values(historyApi).forEach((fn) => fn.mockReset());
  groupApi.fetchGroupMembers.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  groupApi.fetchGroupMembers.mockResolvedValue([zad, sam, kim]);
});

describe.each([
  ["movie", base],
  ["TV episode", episode],
])("editing a group %s", (_label, make) => {
  test("prepopulates every field, including who watched", async () => {
    render(<Harness initial={make()} />);
    const dialog = await openEditor();

    expect(within(dialog).getByLabelText(/watched date/i)).toHaveValue("2026-09-19");
    expect(within(dialog).getByLabelText(/location/i)).toHaveValue("Cinema");
    expect(within(dialog).getByLabelText(/notes/i)).toHaveValue("Loved it");
    await waitFor(() => expect(groupApi.fetchGroupMembers).toHaveBeenCalledWith("g1"));
    expect(await within(dialog).findByText("Kim")).toBeInTheDocument();
    expect(chip(dialog, "Zad")).toHaveAttribute("aria-pressed", "true");
    expect(chip(dialog, "Sam")).toHaveAttribute("aria-pressed", "true");
    expect(chip(dialog, "Kim")).toHaveAttribute("aria-pressed", "false");
  });

  test("adds and removes participants and persists them", async () => {
    const entry = make();
    historyApi.updateHistoryEntry.mockResolvedValueOnce({ ...entry, participants: [zad, kim] });
    render(<Harness initial={entry} />);
    const dialog = await openEditor();
    await within(dialog).findByText("Kim");

    fireEvent.click(chip(dialog, "Kim"));
    fireEvent.click(chip(dialog, "Sam"));
    fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(historyApi.updateHistoryEntry).toHaveBeenCalledWith(entry._id, {
        watchedAt: "2026-09-19",
        watchedLocation: "Cinema",
        watchedNotes: "Loved it",
        participants: ["u1", "u3"],
      })
    );
    // Reopening shows the saved people.
    expect(await within(dialog).findByText(/Zad, Kim/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /edit details/i }));
    await within(dialog).findByText("Sam");
    expect(chip(dialog, "Kim")).toHaveAttribute("aria-pressed", "true");
    expect(chip(dialog, "Sam")).toHaveAttribute("aria-pressed", "false");
  });

  test("changing only the date leaves participants, location and notes untouched", async () => {
    const entry = make();
    historyApi.updateHistoryEntry.mockResolvedValueOnce({ ...entry, watchedAt: "2026-09-01T00:00:00.000Z" });
    render(<Harness initial={entry} />);
    const dialog = await openEditor();
    await within(dialog).findByText("Kim");

    fireEvent.change(within(dialog).getByLabelText(/watched date/i), { target: { value: "2026-09-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(historyApi.updateHistoryEntry).toHaveBeenCalledTimes(1));
    const payload = historyApi.updateHistoryEntry.mock.calls[0][1];
    expect(payload).toEqual({ watchedAt: "2026-09-01", watchedLocation: "Cinema", watchedNotes: "Loved it" });
    expect("participants" in payload).toBe(false);
  });

  test("requires at least one participant, like the add flow", async () => {
    render(<Harness initial={make()} />);
    const dialog = await openEditor();
    await within(dialog).findByText("Kim");

    fireEvent.click(chip(dialog, "Zad"));
    fireEvent.click(chip(dialog, "Sam"));
    fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

    expect(await within(dialog).findByText(/select at least one person/i)).toBeInTheDocument();
    expect(historyApi.updateHistoryEntry).not.toHaveBeenCalled();
  });
});

test("a failed save keeps the editor open with the user's changes", async () => {
  historyApi.updateHistoryEntry.mockRejectedValueOnce({ response: { data: { msg: "Select valid group participants." } } });
  render(<Harness initial={base()} />);
  const dialog = await openEditor();
  await within(dialog).findByText("Kim");

  fireEvent.change(within(dialog).getByLabelText(/location/i), { target: { value: "Home" } });
  fireEvent.click(chip(dialog, "Kim"));
  fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Select valid group participants."));
  expect(within(dialog).getByLabelText(/location/i)).toHaveValue("Home");
  expect(chip(dialog, "Kim")).toHaveAttribute("aria-pressed", "true");
  expect(within(dialog).getByRole("button", { name: /save changes/i })).toBeEnabled();
});

test("cancel discards unsaved edits", async () => {
  render(<Harness initial={base()} />);
  let dialog = await openEditor();
  await within(dialog).findByText("Kim");
  fireEvent.change(within(dialog).getByLabelText(/location/i), { target: { value: "Home" } });
  fireEvent.click(chip(dialog, "Kim"));
  fireEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

  dialog = await openEditor();
  await within(dialog).findByText("Kim");
  expect(within(dialog).getByLabelText(/location/i)).toHaveValue("Cinema");
  expect(chip(dialog, "Kim")).toHaveAttribute("aria-pressed", "false");
});

test("a participant who left the group stays listed and removable", async () => {
  groupApi.fetchGroupMembers.mockResolvedValue([zad]);
  render(<Harness initial={base()} />);
  const dialog = await openEditor();
  await waitFor(() => expect(groupApi.fetchGroupMembers).toHaveBeenCalled());

  expect(chip(dialog, "Sam")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(chip(dialog, "Sam"));
  fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));
  await waitFor(() => expect(historyApi.updateHistoryEntry.mock.calls[0][1].participants).toEqual(["u1"]));
});

test("if members can't load, existing participants are still editable", async () => {
  groupApi.fetchGroupMembers.mockRejectedValue(new Error("offline"));
  render(<Harness initial={base()} />);
  const dialog = await openEditor();

  expect(await within(dialog).findByText(/couldn't load group members/i)).toBeInTheDocument();
  expect(chip(dialog, "Zad")).toHaveAttribute("aria-pressed", "true");
  expect(chip(dialog, "Sam")).toHaveAttribute("aria-pressed", "true");
});

test("personal entries edit normally and never send participants", async () => {
  const entry = base({ scope: "personal", group: null, participants: [zad], watchedLocation: "", watchedNotes: "" });
  historyApi.updateHistoryEntry.mockResolvedValueOnce({ ...entry, watchedLocation: "Couch" });
  render(<Harness initial={entry} />);
  const dialog = await openEditor();

  expect(within(dialog).getByTestId("edit-participants")).toHaveTextContent(/just you/i);
  expect(within(dialog).queryByTestId("group-select-member")).not.toBeInTheDocument();
  expect(groupApi.fetchGroupMembers).not.toHaveBeenCalled();

  fireEvent.change(within(dialog).getByLabelText(/location/i), { target: { value: "Couch" } });
  fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));
  await waitFor(() =>
    expect(historyApi.updateHistoryEntry).toHaveBeenCalledWith("h1", { watchedAt: "2026-09-19", watchedLocation: "Couch", watchedNotes: "" })
  );
});
