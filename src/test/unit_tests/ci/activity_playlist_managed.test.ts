import { ACTIVITY_IPC_REQUEST } from "../../../constants";
import { initActivityWorker } from "../../../structures/activity_bridge";
import GuildPreference from "../../../structures/guild_preference";
import SeekType from "../../../enums/option_types/seek_type";
import State from "../../../state";
import assert from "assert";
import sinon from "sinon";

type Handler = (msg: { cid: string; op: string; args: unknown }) => void;

describe("activity set option while a playlist is set", () => {
    let handler: Handler;
    let replies: Array<{
        cid: string;
        payload: { ok: boolean; reason?: string };
    }>;

    let guildPreference: GuildPreference;
    const sandbox = sinon.createSandbox();
    const ipcSandbox = sinon.createSandbox();

    const setOption = async (
        args: Record<string, unknown>,
    ): Promise<{ ok: boolean; reason?: string }> => {
        const cid = `cid-${replies.length}`;
        handler({
            cid,
            op: "setOption",
            args: { guildID: "123", userID: "456", ...args },
        });

        for (let i = 0; i < 100; i++) {
            const reply = replies.find((x) => x.cid === cid);
            if (reply) return reply.payload;
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
                setTimeout(resolve, 10);
            });
        }

        throw new Error("no reply");
    };

    before(() => {
        replies = [];
        ipcSandbox.stub(State, "ipc").value({
            register: (op: string, fn: Handler) => {
                if (op === ACTIVITY_IPC_REQUEST) handler = fn;
            },
            sendToAdmiral: (_event: string, msg: (typeof replies)[number]) => {
                replies.push(msg);
            },
        });

        initActivityWorker();
    });

    beforeEach(() => {
        guildPreference = new GuildPreference("123");
        sandbox.stub(guildPreference, "updateGuildPreferences");
        sandbox
            .stub(GuildPreference, "getGuildPreference")
            .resolves(guildPreference);
        guildPreference.gameOptions.spotifyPlaylistID = "spotify|abc";
    });

    afterEach(() => {
        sandbox.restore();
    });

    after(() => {
        ipcSandbox.restore();
    });

    it("rejects song-pool options the playlist manages", async () => {
        const genderBefore = [...guildPreference.gameOptions.gender];
        const reply = await setOption({ kind: "gender", genders: ["male"] });

        assert.deepStrictEqual(reply, {
            ok: false,
            reason: "playlist_managed",
        });

        assert.deepStrictEqual(
            guildPreference.gameOptions.gender,
            genderBefore,
        );
    });

    it("still accepts options a playlist doesn't manage", async () => {
        const reply = await setOption({
            kind: "seek",
            seek: SeekType.BEGINNING,
        });

        assert.deepStrictEqual(reply, { ok: true });
        assert.strictEqual(
            guildPreference.gameOptions.seekType,
            SeekType.BEGINNING,
        );
    });
});
