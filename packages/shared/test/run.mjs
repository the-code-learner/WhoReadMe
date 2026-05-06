import assert from "node:assert/strict";
import { detectTrackers, signedQuery, verifySignedQuery } from "../dist/index.js";

const query = await signedQuery("secret", { messageId: "msg_1", recipientId: "rec_1" });
assert.equal(await verifySignedQuery("secret", query), true);

query.set("recipientId", "rec_2");
assert.equal(await verifySignedQuery("secret", query), false);

const result = detectTrackers('<img src="https://example.com/open.gif" width="1" height="1"><a href="https://t.example.com/click?id=1">Open</a>');
assert.equal(result.riskLevel, "medium");
assert.equal(result.findings.length, 2);

console.log("shared tests passed");

