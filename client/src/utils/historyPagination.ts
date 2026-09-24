import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { isTvEntry } from "./historyEntry";
import { historyCalendarDay } from "./historyTimeline";

export interface HistoryPage {
  items: HistoryEntry[];
  nextCursor: string | null;
}

export type FetchHistoryPage = (cursor: string, limit: number) => Promise<HistoryPage>;

export const CONTINUATION_PAGE_SIZE = 25;
/** Hard stop so a pathological day cannot pull the whole history. */
export const MAX_CONTINUATION_PAGES = 8;

/**
 * Raw history is paginated before TV grouping, so a series/day session can
 * straddle the page boundary. This pulls in the rest of the trailing
 * *calendar day* so that no session on the loaded page is silently split.
 *
 * Why the whole day and not "consecutive records of the same session": all
 * date-only watches share the identical UTC-midnight `watchedAt`, so inside a
 * day the server order is `_id desc` (creation order). A movie logged between
 * two episodes of one series therefore interleaves them, and a boundary right
 * there would still split the session. Completing the day is a strict
 * superset that is always correct and stays small in practice.
 *
 * Rules:
 * - Only runs when there is a next page and the loaded part of the trailing
 *   day contains at least one TV episode (otherwise nothing can be split).
 * - Continuation records are appended while they belong to that same day.
 * - The first record from an earlier day is never consumed: it stays on the
 *   server side of the boundary and `nextCursor` becomes the id of the last
 *   record we did include (the server cursor accepts any entry id).
 * - When a continuation page is exhausted without leaving the day, the loop
 *   keeps going with that page's cursor until the day ends, the history ends,
 *   or the page cap is hit.
 */
export const completeTrailingDay = async (page: HistoryPage, fetchMore: FetchHistoryPage): Promise<HistoryPage> => {
  const items = [...page.items];
  let nextCursor = page.nextCursor;
  if (!items.length || !nextCursor) return { items, nextCursor };

  const day = historyCalendarDay(items[items.length - 1].watchedAt);
  if (!day) return { items, nextCursor };
  const loadedDayHasTv = items.some((entry) => historyCalendarDay(entry.watchedAt) === day && isTvEntry(entry));
  if (!loadedDayHasTv) return { items, nextCursor };

  const seen = new Set(items.map((entry) => entry._id));
  for (let pages = 0; pages < MAX_CONTINUATION_PAGES && nextCursor; pages += 1) {
    const more = await fetchMore(nextCursor, CONTINUATION_PAGE_SIZE);
    let stoppedInsidePage = false;
    for (const entry of more.items) {
      if (historyCalendarDay(entry.watchedAt) !== day) {
        stoppedInsidePage = true;
        break;
      }
      if (!seen.has(entry._id)) {
        seen.add(entry._id);
        items.push(entry);
      }
    }
    if (stoppedInsidePage) {
      // Resume right after the last record we kept; the non-matching record
      // and everything after it are still ahead of the cursor.
      nextCursor = items[items.length - 1]._id;
      return { items, nextCursor };
    }
    nextCursor = more.nextCursor;
  }
  return { items, nextCursor };
};
