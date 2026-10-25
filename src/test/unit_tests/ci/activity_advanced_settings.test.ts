import { ACTIVITY_IPC_REQUEST } from "../../../constants";
import { initActivityWorker } from "../../../structures/activity_bridge";
import GuildPreference from "../../../structures/guild_preference";
import State from "../../../state";
import assert from "assert";
import sinon from "sinon";

type Handler = (msg: { cid: string; op: string; args: unknown }) => void;
type Reply = { cid: string; payload: { ok: boolean; reason?: string } };

describe("activity advanced settings", () => {
    const sandbox = sinon.createSandbox();
    const ipcSandbox = sinon.createSandbox();
    let handler: Handler;
    const replies: Reply[] = [];
    let guildPreference: GuildPreference;

    const setOption = async (
        args: Record<string, unknown>,
    ): Promise<Reply["payload"]> => {
        const cid = `cid-${replies.length}-${Date.now()}`;
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
        ipcSandbox.stub(State, "ipc").value({
            register: (op: string, fn: Handler) => {
                if (op === ACTIVITY_IPC_REQUEST) handler = fn;
            },
            sendToAdmiral: (_event: string, msg: Reply) => {
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
    });

    afterEach(() => {
        sandbox.restore();
    });

    after(() => {
        ipcSandbox.restore();
    });

    it("applies each advanced delay to the guild preference", async () => {
        assert.deepStrictEqual(
            await setOption({
                kind: "advanced",
                setting: "multiguess_delay",
                value: 4.5,
            }),
            { ok: true },
        );

        assert.deepStrictEqual(
            await setOption({
                kind: "advanced",
                setting: "song_start_delay",
                value: 0,
            }),
            { ok: true },
        );

        assert.strictEqual(guildPreference.getMultiGuessDelay(), 4.5);
        assert.strictEqual(guildPreference.getSongStartDelay(), 0);
    });
});
