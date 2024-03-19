export default class RateLimiter {
    public limitMap: { [userID: string]: Array<number> };
    private queueCapacity: number;
    private queueExpiryTime: number;

    constructor(queueCapacity: number, queueExpiryTime: number) {
        this.queueCapacity = queueCapacity;
        this.queueExpiryTime = queueExpiryTime;
        this.limitMap = {};
    }

    /**
     * @param userID - the user's ID
     * @returns the time remaining until the next request can be processed, in milliseconds
     */
    public timeRemaining(userID: string): number {
        const previousRequestDates = this.limitMap[userID];
        if (!previousRequestDates) return 0;
        return Math.max(
            previousRequestDates[0]! + this.queueExpiryTime * 1000 - Date.now(),
            0,
        );
    }

    /**
     * @param userID - the user's ID
     * @returns whether another request by the user can be processsed
     */
    public check(userID: string): boolean {
        const currTime = Date.now();
        const previousRequestDates = this.limitMap[userID];
        if (!previousRequestDates) {
            this.limitMap[userID] = [currTime];
            return true;
        }

        if (previousRequestDates.length < this.queueCapacity) {
            previousRequestDates.push(currTime);
            return true;
        }

        const earliestRequest = previousRequestDates[0]!;
        if (this.hasExpired(earliestRequest, currTime)) {
            while (
                previousRequestDates[0] &&
                this.hasExpired(previousRequestDates[0], currTime)
            ) {
                previousRequestDates.shift();
            }

            previousRequestDates.push(currTime);
            return true;
        }

        return false;
    }

    private hasExpired(requestTime: number, currTime: number): boolean {
        return currTime - requestTime > this.queueExpiryTime * 1000;
    }
}
