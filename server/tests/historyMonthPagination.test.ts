import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import router from "../routes/historyRoutes";
import Group from "../models/Groups";
import WatchHistoryEntry from "../models/WatchHistoryEntry";

test("month pages skip years without watches and retain owner scope", async () => {
  const original = { groupFind: Group.find, aggregate: WatchHistoryEntry.aggregate, find: WatchHistoryEntry.find, count: WatchHistoryEntry.countDocuments };
  const userId = new mongoose.Types.ObjectId().toString();
  const queries: any[] = [];
  try {
    Group.find = (() => ({ select: () => ({ lean: async () => [] }) })) as any;
    WatchHistoryEntry.aggregate = (async (pipeline: any[]) => {
      queries.push(pipeline[0].$match);
      return Array.from({ length: 12 }, (_, index) => ({ _id: `2026-${String(12 - index).padStart(2, "0")}` })).concat([{ _id: "2018-03" }, { _id: "2018-01" }]);
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
    const expectedStart = new Date("2018-01-01T00:00:00Z");
    const expectedEnd = new Date("2018-04-01T00:00:00Z");
    assert.equal(body.monthPagination.start, expectedStart.toISOString());
    assert.equal(body.monthPagination.end, expectedEnd.toISOString());
    assert.equal(body.monthPagination.totalPages, 2);
    for (const query of queries) assert.equal(query.participants.toString(), userId);
    assert.deepEqual(queries[queries.length - 1].watchedAt, { $gte: expectedStart, $lt: expectedEnd });
  } finally {
    Group.find = original.groupFind;
    WatchHistoryEntry.aggregate = original.aggregate;
    WatchHistoryEntry.find = original.find;
    WatchHistoryEntry.countDocuments = original.count;
  }
});
