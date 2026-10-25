/* eslint-disable @typescript-eslint/dot-notation */
import GameOption from "../../../enums/game_option_name";
import GuildPreference from "../../../structures/guild_preference";
import Session from "../../../structures/session";
import ShuffleType from "../../../enums/option_types/shuffle_type";
import assert from "assert";
import sinon from "sinon";

describe("guild preference", () => {
    describe("releaseIdleSongLists", () => {
        const sandbox = sinon.createSandbox();
        afterEach(() => {
            sandbox.restore();
        });

        it("drops idle guilds' song lists and keeps active ones", async () => {
            // A guild's first fetch only creates its row; later ones are cached
            for (const id of ["idle-guild", "recent-guild", "playing-guild"]) {
                // eslint-disable-next-line no-await-in-loop
                await GuildPreference.getGuildPreference(id);
            }

            const idle = await GuildPreference.getGuildPreference("idle-guild");
            const recent =
                await GuildPreference.getGuildPreference("recent-guild");

            const playing =
                await GuildPreference.getGuildPreference("playing-guild");

            for (const gp of [idle, recent, playing]) {
                sandbox.stub(gp, "updateGuildPreferences");
                // eslint-disable-next-line no-await-in-loop
                await gp.songSelector.reloadSongs();
            }

            const now = Date.now();
            idle.lastAccessedAt = now - 60 * 60 * 1000;
            playing.lastAccessedAt = now - 60 * 60 * 1000;
            recent.lastAccessedAt = now;
            sandbox
                .stub(Session, "getSession")
                .callsFake((guildID: string) =>
                    guildID === "playing-guild"
                        ? ({} as unknown as Session)
                        : undefined,
                );

            GuildPreference.releaseIdleSongLists(30 * 60 * 1000, now);
            assert.strictEqual(idle.songSelector.selectedSongs, null);
            assert.ok(recent.songSelector.getSongs().songs.size > 0);
            assert.ok(playing.songSelector.getSongs().songs.size > 0);

            // released lists come back on the next reload
            await idle.songSelector.reloadSongs();
            assert.ok(idle.songSelector.getSongs().songs.size > 0);
        });

        it("refreshes lastAccessedAt when a cached preference is fetched", async () => {
            const gp = await GuildPreference.getGuildPreference("idle-guild");
            gp.lastAccessedAt = 0;
            await GuildPreference.getGuildPreference("idle-guild");
            assert.ok(gp.lastAccessedAt > 0);
        });
    });

    describe("playlist order shuffle", () => {
        let guildPreference: GuildPreference;
        beforeEach(() => {
            guildPreference = new GuildPreference("123");
            sinon.stub(guildPreference, "updateGuildPreferences");
        });

        afterEach(() => {
            sinon.restore();
        });

        it("is only effective while a playlist is set", () => {
            guildPreference.gameOptions.shuffleType =
                ShuffleType.PLAYLIST_ORDER;

            assert.strictEqual(
                guildPreference.getEffectiveShuffleType(),
                ShuffleType.RANDOM,
            );

            guildPreference.gameOptions.spotifyPlaylistID = "spotify|abc";
            assert.strictEqual(
                guildPreference.getEffectiveShuffleType(),
                ShuffleType.PLAYLIST_ORDER,
            );
        });

        it("is reset when the playlist is cleared", async () => {
            guildPreference.gameOptions.spotifyPlaylistID = "spotify|abc";
            await guildPreference.setShuffleType(ShuffleType.PLAYLIST_ORDER);
            await guildPreference.setKmqPlaylistID(null);
            assert.strictEqual(
                guildPreference.gameOptions.shuffleType,
                ShuffleType.RANDOM,
            );
        });

        it("keeps other shuffle types when the playlist is cleared", async () => {
            guildPreference.gameOptions.spotifyPlaylistID = "spotify|abc";
            await guildPreference.setShuffleType(ShuffleType.POPULARITY);
            await guildPreference.setKmqPlaylistID(null);
            assert.strictEqual(
                guildPreference.gameOptions.shuffleType,
                ShuffleType.POPULARITY,
            );
        });

        it("is normalized away by validation when no playlist is set", async () => {
            guildPreference.gameOptions.shuffleType =
                ShuffleType.PLAYLIST_ORDER;
            await guildPreference.validateGameOptions();
            assert.strictEqual(
                guildPreference.gameOptions.shuffleType,
                ShuffleType.RANDOM,
            );
        });

        it("survives validation when a playlist is set", async () => {
            guildPreference.gameOptions.shuffleType =
                ShuffleType.PLAYLIST_ORDER;
            guildPreference.gameOptions.spotifyPlaylistID = "spotify|abc";
            await guildPreference.validateGameOptions();
            assert.strictEqual(
                guildPreference.gameOptions.shuffleType,
                ShuffleType.PLAYLIST_ORDER,
            );
        });
    });

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

    describe("setDuration", () => {
        const guildPreference = GuildPreference.fromGuild("123");

        beforeEach(async () => {
            await guildPreference.resetToDefault();
        });

        it("sets a numeric duration and reports it as active", async () => {
            await guildPreference.setDuration(120);
            assert.strictEqual(guildPreference.gameOptions.duration, 120);
            assert.strictEqual(guildPreference.isDurationSet(), true);
        });

        it("accepts null to clear the duration (the reset path)", async () => {
            await guildPreference.setDuration(120);
            // This is exactly what reset()/the Activity's "clear" invokes —
            // the signature must allow null, not just rely on an `as number`
            // cast at the call site.
            await guildPreference.setDuration(null);
            assert.strictEqual(guildPreference.gameOptions.duration, null);
            assert.strictEqual(guildPreference.isDurationSet(), false);
        });

        it("reset(DURATION) clears it identically to setDuration(null)", async () => {
            await guildPreference.setDuration(90);
            await guildPreference.reset(GameOption.DURATION);
            assert.strictEqual(guildPreference.gameOptions.duration, null);
            assert.strictEqual(guildPreference.isDurationSet(), false);
        });
    });
});
