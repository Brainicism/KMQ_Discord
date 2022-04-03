/* eslint-disable @typescript-eslint/dot-notation */
import assert from "assert";

import GuildPreference from "../../structures/guild_preference";

describe("fromGuild", () => {
    describe("no guild preference provided", () => {
        it("should return a guild preference with default options", () => {
            const guildPreference = GuildPreference.fromGuild("123");
            assert.deepStrictEqual(
                GuildPreference.DEFAULT_OPTIONS,
                guildPreference.gameOptions
            );
        });
    });

    describe("guild preference provided", () => {
        describe("it is neither missing, nor has extra game options", () => {
            const filledGameOptions = { ...GuildPreference.DEFAULT_OPTIONS };
            filledGameOptions.endYear = 2025;

            it("should return a guild preference with the missing game options as their default values", () => {
                const guildPreference = GuildPreference.fromGuild(
                    "123",
                    filledGameOptions
                );

                assert.deepStrictEqual(
                    filledGameOptions,
                    guildPreference.gameOptions
                );
            });
        });

        describe("it has missing game options", () => {
            it("should return a guild preference with the missing game options as their default values", () => {
                const gameOptionsWithMissingLanguageType = {
                    ...GuildPreference.DEFAULT_OPTIONS,
                };

                delete gameOptionsWithMissingLanguageType["languageType"];
                const guildPreference = GuildPreference.fromGuild(
                    "123",
                    gameOptionsWithMissingLanguageType
                );

                assert.deepStrictEqual(
                    GuildPreference.DEFAULT_OPTIONS,
                    guildPreference.gameOptions
                );
            });
        });

        describe("it has extraneous game options", () => {
            it("should return a guild preference without the extraneous values", () => {
                const gameOptionsWithExtraValues = {
                    ...GuildPreference.DEFAULT_OPTIONS,
                };

                const nonExistentOption = "option_that_doesnt_exist";
                gameOptionsWithExtraValues[nonExistentOption] = 58;
                const guildPreference = GuildPreference.fromGuild(
                    "123",
                    gameOptionsWithExtraValues
                );

                assert.strictEqual(
                    nonExistentOption in guildPreference.gameOptions,
                    false
                );
            });
        });
    });
});
