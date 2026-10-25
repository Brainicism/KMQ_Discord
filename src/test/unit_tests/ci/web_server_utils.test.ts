import { pruneExpiredEntries } from "../../../web_server/web_server_utils";
import assert from "assert";

describe("web server utils", () => {
    describe("pruneExpiredEntries", () => {
        it("drops expired entries and keeps live ones", () => {
            const map = new Map([
                ["expired", { expiresAt: 999 }],
                ["boundary", { expiresAt: 1000 }],
                ["live", { expiresAt: 1001 }],
            ]);

            pruneExpiredEntries(map, 1000);
            assert.deepStrictEqual([...map.keys()], ["live"]);
        });
    });
});
