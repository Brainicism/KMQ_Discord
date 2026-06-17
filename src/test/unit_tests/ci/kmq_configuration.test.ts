/* eslint-disable @typescript-eslint/dot-notation */
import KmqConfiguration from "../../../kmq_configuration";
import assert from "assert";

describe("KmqConfiguration", () => {
    describe("activityReducedEmbeds", () => {
        let original: { [featureSwitch: string]: boolean };

        beforeEach(() => {
            // Snapshot the live config so each test can mutate it freely.
            original = { ...(KmqConfiguration.Instance as any)["config"] };
        });

        afterEach(() => {
            (KmqConfiguration.Instance as any)["config"] = original;
        });

        const setFlag = (value: boolean | undefined): void => {
            const config = (KmqConfiguration.Instance as any)["config"];
            if (value === undefined) {
                delete config["activityReducedEmbeds"];
            } else {
                config["activityReducedEmbeds"] = value;
            }
        };

        it("defaults to false when the switch is absent", () => {
            setFlag(undefined);
            assert.strictEqual(
                KmqConfiguration.Instance.activityReducedEmbeds(),
                false,
            );
        });

        it("returns true when the switch is enabled", () => {
            setFlag(true);
            assert.strictEqual(
                KmqConfiguration.Instance.activityReducedEmbeds(),
                true,
            );
        });

        it("returns false when the switch is explicitly disabled", () => {
            setFlag(false);
            assert.strictEqual(
                KmqConfiguration.Instance.activityReducedEmbeds(),
                false,
            );
        });
    });
});
