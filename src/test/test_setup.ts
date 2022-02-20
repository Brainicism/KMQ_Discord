// eslint-disable-next-line import/no-extraneous-dependencies
import sinon from "sinon";
import crypto from "crypto";
import * as discordUtils from "../helpers/discord_utils";
import kmqKnexConfig from "../config/knexfile_kmq";
import dbContext from "../database_context";
import Player from "../structures/player";
import { EnvType } from "../types";
import { IPCLogger } from "../logger";
import { md5Hash } from "../helpers/utils";
import { state } from "../kmq_worker";
import LocalizationManager from "../helpers/localization_manager";

const logger = new IPCLogger("test_setup");
const sandbox = sinon.createSandbox();

export const MOCK_SONG_COUNT = 1000;

async function setup(): Promise<void> {
    await dbContext.kmq.raw("DROP TABLE IF EXISTS available_songs");
    await dbContext.kmq.raw("DROP TABLE IF EXISTS kpop_groups");
    await dbContext.kmq.raw(`CREATE TABLE available_songs (
        song_name_en VARCHAR(255),
        clean_song_name_en VARCHAR(255),
        song_name_ko VARCHAR(255),
        clean_song_name_ko VARCHAR(255),
        link VARCHAR(255),
        artist_name_en VARCHAR(255),
        artist_name_ko VARCHAR(255),
        members ENUM('male', 'female', 'coed'),
        views BIGINT(19),
        id_artist INT(10),
        issolo ENUM('y', 'n'),
        publishedon DATE,
        id_parent_artist INT(10),
        vtype ENUM('main', 'audio'),
        tags VARCHAR(255),
        rank INT
    )`);

    await dbContext.kmq.raw(`CREATE TABLE kpop_groups(
        id INT(10),
        name VARCHAR(255),
        members ENUM('male', 'female', 'coed'),
        issolo ENUM('y', 'n'),
        id_parentgroup INT(10),
        id_artist1 INT(10),
        id_artist2 INT(10),
        id_artist3 INT(10),
        id_artist4 INT(10)
    )`);
}

export const mockArtists = [
    { id: 1, name: "A", members: "male", issolo: "n" },
    { id: 2, name: "B", members: "male", issolo: "n" },
    { id: 3, name: "C", members: "male", issolo: "n" },
    { id: 4, name: "D", members: "male", issolo: "y" },
    { id: 5, name: "E", members: "female", issolo: "n" },
    { id: 6, name: "F", members: "female", issolo: "n", id_parentgroup: 5 },
    { id: 7, name: "G", members: "female", issolo: "n" },
    { id: 8, name: "H", members: "female", issolo: "y" },
    { id: 9, name: "I", members: "female", issolo: "y", id_parentgroup: 8 },
    { id: 10, name: "J", members: "coed", issolo: "n" },
    { id: 11, name: "K", members: "coed", issolo: "n" },
    {
        id: 12,
        name: "J + K",
        members: "coed",
        issolo: "n",
        id_artist1: 10,
        id_artist2: 11,
    },
    {
        id: 13,
        name: "F + G",
        members: "female",
        issolo: "n",
        id_artist1: 6,
        id_artist2: 7,
    },
    {
        id: 14,
        name: "E + H",
        members: "female",
        issolo: "n",
        id_artist1: 5,
        id_artist2: 8,
    },
    { id: 15, name: "conflictingName", members: "coed", issolo: "n" },
];

export const mockSongs = [...Array(MOCK_SONG_COUNT).keys()].map((i) => {
    const artist = mockArtists[md5Hash(i, 8) % mockArtists.length];
    return {
        song_name_en: `${crypto.randomBytes(8).toString("hex")}`,
        song_name_ko: `${crypto.randomBytes(8).toString("hex")}`,
        link: crypto.randomBytes(4).toString("hex"),
        artist_name_en: artist.name,
        artist_name_ko: artist.name,
        members: artist.members,
        views: md5Hash(i, 16),
        id_artist: artist.id,
        issolo: artist.issolo,
        publishedon: new Date(
            `${
                ["2008", "2009", "2016", "2017", "2018"][md5Hash(i, 8) % 5]
            }-06-01`
        ),
        id_parent_artist: artist.id_parentgroup || 0,
        vtype: Math.random() < 0.25 ? "audio" : "main",
        tags: ["", "", "o", "c", "e", "drv", "ax", "ps"][md5Hash(i, 8) % 8],
        rank:
            i < MOCK_SONG_COUNT / 2
                ? process.env.AUDIO_SONGS_PER_ARTIST
                : process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST,
    };
});

async function insertMockData(): Promise<void> {
    await dbContext.kmq("available_songs").insert(mockSongs);

    logger.info("Done inserting mock songs");
    await dbContext.kmq("kpop_groups").insert(mockArtists);

    logger.info("Done inserting mock artists");
}

before(async function () {
    this.timeout(10000);
    sandbox.stub(discordUtils, "sendErrorMessage");
    sandbox.stub(discordUtils, "sendInfoMessage");
    sandbox
        .stub(Player, "fromUserID")
        .callsFake((id) => new Player("", id, "", 0));
    console.log("Performing migrations...");
    await dbContext.agnostic.raw("DROP DATABASE IF EXISTS kmq_test;");
    await dbContext.agnostic.raw("CREATE DATABASE kmq_test;");
    await dbContext.kmq.migrate.latest({
        directory: kmqKnexConfig.migrations.directory,
    });

    if (process.env.NODE_ENV !== EnvType.TEST) {
        logger.error("Must be running with NODE_ENV=EnvType.TEST");
        process.exit(1);
    }

    state.localizer = new LocalizationManager();
    this.timeout(10000);
    logger.info("Setting up test database...");
    await setup();
    await insertMockData();
    return false;
});

after(async function () {
    this.timeout(10000);
    sandbox.restore();
    console.log("Rolling back migrations...");
    await dbContext.kmq.migrate.rollback(
        {
            directory: kmqKnexConfig.migrations.directory,
        },
        true
    );

    console.log("Test re-applying migrations...");
    await dbContext.kmq.migrate.latest({
        directory: kmqKnexConfig.migrations.directory,
    });
    dbContext.destroy();
});
