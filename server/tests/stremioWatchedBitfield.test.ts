import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { decodeStremioWatchedVideos, parseStremioEpisodeId } from "../services/integrations/stremioWatchedBitfield";

test("official Stremio watched bitfield fixture decodes episode identities", () => {
  const ids = Array.from({ length: 9 }, (_, index) => `tt2934286:1:${index + 1}`);
  assert.deepEqual(decodeStremioWatchedVideos("tt2934286:1:5:5:eJyTZwAAAEAAIA==", ids), ids.slice(0, 5));
});

test("bitfield anchor offset aligns newly inserted videos without treating the resume pointer as completion", () => {
  const packed = deflateSync(Buffer.from([5])).toString("base64");
  const ids = ["tt2934286:0:1", "tt2934286:1:1", "tt2934286:1:2", "tt2934286:1:3"];
  assert.deepEqual(decodeStremioWatchedVideos(`tt2934286:1:3:3:${packed}`, ids), [ids[1], ids[3]]);
});

test("malformed bitfields, unknown anchors, and unsafe lengths are rejected", () => {
  for (const value of ["bad", "tt2934286:1:1:99999999999999999999:eJyTZwAAAEAAIA==", "tt2934286:1:1:1:YWJj", "tt2934286:1:2:2:eJyTZwAAAEAAIA=="]) {
    assert.equal(decodeStremioWatchedVideos(value, ["tt2934286:1:1"]), null, value);
  }
});

test("episode parser accepts specials and rejects generic series and malformed identities", () => {
  assert.deepEqual(parseStremioEpisodeId("TT2934286:0:1"), { seriesImdbId: "tt2934286", seasonNumber: 0, episodeNumber: 1 });
  for (const id of ["tt2934286", "tt2934286:1:0", "tt2934286:-1:1", "tt2934286:01:1", "addon:1:2", "tt2934286:1:1:extra"]) {
    assert.equal(parseStremioEpisodeId(id), null, id);
  }
});
