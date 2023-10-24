/* eslint-disable no-await-in-loop */
import { delay } from "../../helpers/utils";
import RateLimiter from "../../rate_limiter";
import assert from "assert";

describe("rate limiter", () => {
    let rateLimiter: RateLimiter;
    const queueCapacity = 10;
    const queueExpiryTime = 0.25;
    const expiryFudgeFactor = 1.05;

    beforeEach(() => {
        rateLimiter = new RateLimiter(queueCapacity, queueExpiryTime);
    });

    const userID = "123";
    describe("queue filling, no expiring", () => {
        describe("queue is not filled to capacity", () => {
            it("should allow all requests to pass", () => {
                for (let i = 0; i < queueCapacity - 1; i++) {
                    assert.strictEqual(rateLimiter.check(userID), true);
                }

                assert.strictEqual(
                    rateLimiter.limitMap[userID].length,
                    queueCapacity - 1,
                );
            });
        });

        describe("queue is filled to capacity", () => {
            it("should allow all requests to pass", () => {
                for (let i = 0; i < queueCapacity; i++) {
                    assert.strictEqual(rateLimiter.check(userID), true);
                }

                assert.strictEqual(
                    rateLimiter.limitMap[userID].length,
                    queueCapacity,
                );
            });
        });

        describe("queue is filled to capacity, and several more requests enter", () => {
            const extraRequests = queueCapacity / 2;
            it("should allow all requests to pass up until capacity, then reject further", () => {
                for (let i = 0; i < queueCapacity; i++) {
                    assert.strictEqual(rateLimiter.check(userID), true);
                }

                for (let i = 0; i < extraRequests; i++) {
                    assert.strictEqual(rateLimiter.check(userID), false);
                }

                assert.strictEqual(
                    rateLimiter.limitMap[userID].length,
                    queueCapacity,
                );
            });
        });
    });

    describe("queue filling, expiring", () => {
        describe("non-staggered", () => {
            describe("queue completely fills, completely expires, and another request comes in", () => {
                it("should allow all requests to pass", async () => {
                    for (let i = 0; i < queueCapacity; i++) {
                        assert.strictEqual(rateLimiter.check(userID), true);
                    }

                    await delay(queueExpiryTime * expiryFudgeFactor * 1000);
                    assert.strictEqual(rateLimiter.check(userID), true);
                    assert.strictEqual(rateLimiter.limitMap[userID].length, 1);
                });
            });

            describe("queue completely fills, completely expires, and completely fills again", () => {
                it("should allow all requests to pass", async () => {
                    for (let i = 0; i < queueCapacity; i++) {
                        assert.strictEqual(rateLimiter.check(userID), true);
                    }

                    await delay(queueExpiryTime * expiryFudgeFactor * 1000);

                    for (let i = 0; i < queueCapacity; i++) {
                        assert.strictEqual(rateLimiter.check(userID), true);
                    }

                    assert.strictEqual(
                        rateLimiter.limitMap[userID].length,
                        queueCapacity,
                    );
                });
            });
        });

        describe("staggered", () => {
            const requestsToExpire = 3;
            const staggerDelay = (queueExpiryTime / queueCapacity) * 1000;
            describe("queue completely filled up, several requests expire, and several more requests enter at the same time", () => {
                it("should allow all requests to pass, then allow an equal number of expired requests to pass, fail otherwise", async () => {
                    for (let i = 0; i < queueCapacity; i++) {
                        await delay(staggerDelay * expiryFudgeFactor);
                        assert.strictEqual(rateLimiter.check(userID), true);
                    }

                    assert.strictEqual(
                        rateLimiter.limitMap[userID].length,
                        queueCapacity,
                    );

                    await delay(
                        staggerDelay * expiryFudgeFactor * requestsToExpire,
                    );

                    for (let i = 0; i < requestsToExpire; i++) {
                        assert.strictEqual(rateLimiter.check(userID), true);
                    }

                    assert.strictEqual(rateLimiter.check(userID), false);
                    assert.strictEqual(rateLimiter.check(userID), false);
                    assert.strictEqual(rateLimiter.check(userID), false);
                    assert.strictEqual(
                        rateLimiter.limitMap[userID].length,
                        queueCapacity,
                    );
                });
            });

            describe("queue completely filled up, several requests expire, and several more requests enter staggered", () => {
                it("should allow all requests to pass, then allow an equal number of expired requests to pass, fail otherwise", async () => {
                    for (let i = 0; i < queueCapacity; i++) {
                        await delay(staggerDelay * expiryFudgeFactor);
                        assert.strictEqual(rateLimiter.check(userID), true);
                    }

                    assert.strictEqual(
                        rateLimiter.limitMap[userID].length,
                        queueCapacity,
                    );

                    for (let i = 0; i < requestsToExpire; i++) {
                        await delay(staggerDelay * expiryFudgeFactor);
                        assert.strictEqual(rateLimiter.check(userID), true);
                    }

                    assert.strictEqual(rateLimiter.check(userID), false);
                    assert.strictEqual(rateLimiter.check(userID), false);
                    assert.strictEqual(rateLimiter.check(userID), false);
                    assert.strictEqual(
                        rateLimiter.limitMap[userID].length,
                        queueCapacity,
                    );
                });
            });
        });
    });

    describe("multiple users", () => {
        const userID2 = "234";
        describe("user 1 hits limit, user 2 doesn't", () => {
            it("should pass all requests until capacity for user 1, and fail else. user 2 should all pass", () => {
                for (let i = 0; i < queueCapacity; i++) {
                    assert.strictEqual(rateLimiter.check(userID), true);
                }

                for (let i = 0; i < queueCapacity / 2; i++) {
                    assert.strictEqual(rateLimiter.check(userID2), true);
                }

                assert.strictEqual(
                    rateLimiter.limitMap[userID].length,
                    queueCapacity,
                );
                assert.strictEqual(rateLimiter.check(userID), false);
                assert.strictEqual(rateLimiter.check(userID2), true);
                assert.strictEqual(
                    rateLimiter.limitMap[userID2].length,
                    queueCapacity / 2 + 1,
                );
            });
        });
    });
});
