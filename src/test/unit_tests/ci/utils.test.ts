import { getOrdinalNum } from "../../../helpers/utils";
import assert from "assert";

describe("utils", () => {
    describe("getOrdinalNum", () => {
        it("uses st/nd/rd for numbers ending in 1-3", () => {
            for (const [n, expected] of [
                [1, "1st"],
                [2, "2nd"],
                [3, "3rd"],
                [21, "21st"],
                [22, "22nd"],
                [23, "23rd"],
                [101, "101st"],
                [1002, "1,002nd"],
            ] as const) {
                assert.strictEqual(getOrdinalNum(n), expected);
            }
        });

        it("uses th for the teens, including 111-113 and beyond", () => {
            for (const [n, expected] of [
                [4, "4th"],
                [11, "11th"],
                [12, "12th"],
                [13, "13th"],
                [20, "20th"],
                [111, "111th"],
                [112, "112th"],
                [113, "113th"],
                [212, "212th"],
            ] as const) {
                assert.strictEqual(getOrdinalNum(n), expected);
            }
        });
    });
});
