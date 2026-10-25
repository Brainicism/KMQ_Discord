import { ACTIVITY_IPC_REQUEST } from "../../../constants";
import { initActivityWorker } from "../../../structures/activity_bridge";
import State from "../../../state";

type Handler = (msg: { cid: string; op: string; args: unknown }) => void;
type Payload = { ok: boolean; reason?: string };

let handler: Handler | null = null;
const replies: Array<{ cid: string; payload: Payload }> = [];
let requestCount = 0;

/**
 * Sends a request through the real worker-side Activity IPC handler and waits
 * for its reply. The bridge registers that handler once per process, so every
 * test file shares this one installation instead of stubbing State.ipc itself
 * (a second registration would never happen, leaving its handler unset).
 * @param op - the activity request op
 * @param args - the request args
 * @returns the reply payload
 */
export default async function sendActivityRequest(
    op: string,
    args: Record<string, unknown>,
): Promise<Payload> {
    if (!handler) {
        // Left installed for the rest of the run: the handler's reply path
        // reads State.ipc at reply time.
        State.ipc = {
            register: (registeredOp: string, fn: Handler) => {
                if (registeredOp === ACTIVITY_IPC_REQUEST) handler = fn;
            },
            sendToAdmiral: (
                _event: string,
                msg: { cid: string; payload: Payload },
            ) => {
                replies.push(msg);
            },
        } as unknown as typeof State.ipc;

        initActivityWorker();
    }

    requestCount++;
    const cid = `test-${requestCount}`;
    handler!({ cid, op, args });
    for (let i = 0; i < 200; i++) {
        const reply = replies.find((x) => x.cid === cid);
        if (reply) return reply.payload;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
    }

    throw new Error(`no reply for ${op}`);
}
