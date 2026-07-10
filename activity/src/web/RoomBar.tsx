import { useEffect, useRef, useState } from "react";
import { fetchRoom, roomPath } from "../platform/webPlatform";
import type { WebRoomView } from "../platform/webPlatform";
import type { WebSession } from "../platform/webPlatform";

const ROOM_POLL_INTERVAL_MS = 5_000;
const COPY_FLASH_MS = 1_500;

/**
 * Floating room widget shown over the game on the standalone website: the
 * invite link, live member presence, and a leave button. Presence is
 * server-derived (websocket open/close), polled here — game events and
 * options already flow over the game websocket, this only decorates them
 * with who's in the room.
 */
export default function RoomBar({
    session,
    room: initialRoom,
    onLeave,
    onEvicted,
}: {
    session: WebSession;
    room: WebRoomView;
    onLeave: () => void;
    /** Called when the server no longer recognizes us as a member. */
    onEvicted: () => void;
}): JSX.Element {
    const [room, setRoom] = useState<WebRoomView>(initialRoom);
    const [expanded, setExpanded] = useState(true);
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const poll = async (): Promise<void> => {
            const result = await fetchRoom(session, initialRoom.code);
            if (cancelled) return;
            if ("room" in result) {
                setRoom(result.room);
            } else if (
                result.error === "not_found" ||
                result.error === "unauthorized"
            ) {
                onEvicted();
            }
            // "unavailable" (network blip): keep showing the last state.
        };

        const id = window.setInterval(() => void poll(), ROOM_POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.token, initialRoom.code]);

    useEffect(
        () => () => {
            if (copyTimerRef.current !== null) {
                window.clearTimeout(copyTimerRef.current);
            }
        },
        [],
    );

    const copyInvite = async (): Promise<void> => {
        const invite = `${window.location.origin}${roomPath(room.code)}`;
        try {
            await navigator.clipboard.writeText(invite);
        } catch {
            // Clipboard API unavailable (http, permissions): select-free
            // fallback via a transient input.
            const el = document.createElement("input");
            el.value = invite;
            document.body.appendChild(el);
            el.select();
            try {
                document.execCommand("copy");
            } finally {
                el.remove();
            }
        }

        setCopied(true);
        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
        }

        copyTimerRef.current = window.setTimeout(
            () => setCopied(false),
            COPY_FLASH_MS,
        );
    };

    const connectedCount = room.members.filter((m) => m.connected).length;

    return (
        <div className="kmq-room-bar" data-expanded={expanded}>
            <button
                type="button"
                className="kmq-room-bar-toggle"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
            >
                <span className="kmq-room-bar-dot" aria-hidden />
                Room · {connectedCount}/{room.members.length}
            </button>

            {expanded && (
                <div className="kmq-room-bar-body">
                    <div className="kmq-room-bar-members">
                        {room.members.map((member) => (
                            <span
                                key={member.id}
                                className="kmq-room-bar-member"
                                data-connected={member.connected}
                                title={
                                    member.connected
                                        ? member.username
                                        : `${member.username} (away)`
                                }
                            >
                                {member.avatarUrl ? (
                                    <img
                                        className="kmq-room-bar-avatar"
                                        src={member.avatarUrl}
                                        alt=""
                                    />
                                ) : (
                                    <span className="kmq-room-bar-avatar kmq-room-bar-avatar-fallback">
                                        {member.username
                                            .slice(0, 1)
                                            .toUpperCase()}
                                    </span>
                                )}
                                <span className="kmq-room-bar-name">
                                    {member.username}
                                    {member.id === room.ownerID ? " ★" : ""}
                                </span>
                            </span>
                        ))}
                    </div>

                    <div className="kmq-room-bar-actions">
                        <button
                            type="button"
                            className="kmq-room-bar-button"
                            onClick={() => void copyInvite()}
                        >
                            {copied ? "Copied!" : "Copy invite link"}
                        </button>
                        <button
                            type="button"
                            className="kmq-room-bar-button kmq-room-bar-button-danger"
                            onClick={onLeave}
                        >
                            Leave
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
