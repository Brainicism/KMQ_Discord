/* eslint-disable @typescript-eslint/dot-notation */
import GuildPreference from "../../../structures/guild_preference.js";
import assert from "assert";

describe("guild preference", () => {
    describe("fromGuild", () => {
        describe("no guild preference provided", () => {
            it("should return a guild preference with default options", () => {
                const guildPreference = GuildPreference.fromGuild("123");
                assert.deepStrictEqual(
                    GuildPreference.DEFAULT_OPTIONS,
                    guildPreference.gameOptions,
                );
            });
        });

        describe("guild preference provided", () => {
            describe("it is neither missing, nor has extra game options", () => {
                const filledGameOptions = {
                    ...GuildPreference.DEFAULT_OPTIONS,
                };

                filledGameOptions.endYear = 2025;

                it("should return a guild preference with the missing game options as their default values", () => {
                    const guildPreference = GuildPreference.fromGuild(
                        "123",
                        filledGameOptions,
                    );

                    assert.deepStrictEqual(
                        filledGameOptions,
                        guildPreference.gameOptions,
                    );
                });
            });

            describe("it has missing game options", () => {
                it("should return a guild preference with the missing game options as their default values", () => {
                    const gameOptionsWithMissingLanguageType = {
                        ...GuildPreference.DEFAULT_OPTIONS,
                    };

                    delete (gameOptionsWithMissingLanguageType as any)[
                        "languageType"
                    ];
                    const guildPreference = GuildPreference.fromGuild(
                        "123",
                        gameOptionsWithMissingLanguageType,
                    );

                    assert.deepStrictEqual(
                        GuildPreference.DEFAULT_OPTIONS,
                        guildPreference.gameOptions,
                    );
                });
            });
        });
    });

    describe("presets", () => {
        const guildPreference = GuildPreference.fromGuild("123");
        const BEGINNING_CUTOFF_YEAR = 1999;
        const END_CUTOFF_YEAR = 2017;
        const TEST_PRESET_NAME = "test_preset";

        const filledGameOptions = {
            ...GuildPreference.DEFAULT_OPTIONS,
        };

        filledGameOptions.beginningYear = BEGINNING_CUTOFF_YEAR;
        filledGameOptions.endYear = END_CUTOFF_YEAR;

        beforeEach(async () => {
            await guildPreference.resetToDefault();
            await guildPreference.setBeginningCutoffYear(BEGINNING_CUTOFF_YEAR);
            await guildPreference.setEndCutoffYear(END_CUTOFF_YEAR);
            await guildPreference.savePreset(TEST_PRESET_NAME, null);
            await guildPreference.resetToDefault();
        });

        describe("savePreset", () => {
            it("should include the new preset in the list of presets", async () => {
                const presetList = await guildPreference.listPresets();
                assert(presetList.includes(TEST_PRESET_NAME));
            });
        });

        describe("loadPreset", () => {
            it("should update the current options with values defined in the preset", async () => {
                await guildPreference.loadPreset(TEST_PRESET_NAME, "123");
                // ignore UUID
                delete (guildPreference.gameOptions as any)["uuid"];
                assert.deepStrictEqual(
                    guildPreference.gameOptions,
                    filledGameOptions,
                );
            });
        });

        afterEach(async () => {
            await guildPreference.deletePreset(TEST_PRESET_NAME);
        });
    });
});
