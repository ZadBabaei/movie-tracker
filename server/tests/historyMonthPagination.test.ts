import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import router from "../routes/historyRoutes";
import Group from "../models/Groups";
import WatchHistoryEntry from "../models/WatchHistoryEntry";

test("month pages include a complete twelve-month range and retain owner scope", async () => {
  const original = { groupFind: Group.find, findOne: WatchHistoryEntry.findOne, find: WatchHistoryEntry.find, count: WatchHistoryEntry.countDocuments };
  const userId = new mongoose.Types.ObjectId().toString();
  const queries: any[] = [];
  try {
    Group.find = (() => ({ select: () => ({ lean: async () => [] }) })) as any;
    WatchHistoryEntry.findOne = ((query: any) => {
      queries.push(query);
      return { sort: () => ({ select: () => ({ lean: async () => ({ watchedAt: new Date("2020-01-01") }) }) }) };
    }) as any;
    WatchHistoryEntry.countDocuments = (async () => 163) as any;
    WatchHistoryEntry.find = ((query: any) => {
      queries.push(query);
      return { sort: () => ({ populate: () => ({ lean: async () => [] }) }) };
    }) as any;
    const layer = (router as any).stack.find((item: any) => item.route?.path === "/personal");
    const handle = layer.route.stack.at(-1).handle;
    let body: any;
    await handle({ user: { id: userId }, query: { monthPage: "2" } }, { json: (value: any) => { body = value; } });
    assert.equal(body.stats.total, 163);
    assert.equal(body.nextCursor, null);
    assert.equal(body.monthPagination.page, 2);
    assert.equal(new Date(body.monthPagination.oldestWatchedAt).toISOString(), "2020-01-01T00:00:00.000Z");
    const now = new Date();
    const expectedEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const expectedStart = new Date(Date.UTC(expectedEnd.getUTCFullYear(), expectedEnd.getUTCMonth() - 12, 1));
    assert.equal(body.monthPagination.start, expectedStart.toISOString());
    assert.equal(body.monthPagination.end, expectedEnd.toISOString());
    assert.ok(body.monthPagination.totalPages > 1);
    for (const query of queries) assert.equal(query.participants.toString(), userId);
    assert.deepEqual(queries[queries.length - 1].watchedAt, { $gte: expectedStart, $lt: expectedEnd });
  } finally {
    Group.find = original.groupFind;
    WatchHistoryEntry.findOne = original.findOne;
    WatchHistoryEntry.find = original.find;
    WatchHistoryEntry.countDocuments = original.count;
  }
});
