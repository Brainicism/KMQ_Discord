import { Constants, type Context, YT } from "youtubei.js";
import { IPCLogger } from "./logger";
import GoogleVideo, { PART, Protos, QUALITY, base64ToU8 } from "googlevideo";
import Innertube, { UniversalCache } from "youtubei.js";

/** Copied mostly from https://github.com/LuanRT/googlevideo/blob/main/examples/onesie-request/main.ts */
const logger = new IPCLogger("onesie-provider");

type ClientConfig = {
    clientKeyData: Uint8Array;
    encryptedClientKey: Uint8Array;
    onesieUstreamerConfig: Uint8Array;
    baseUrl: string;
};

type OnesieRequestArgs = {
    videoId: string;
    poToken?: string;
    clientConfig: ClientConfig;
    innertube: Innertube;
};

type OnesieRequest = {
    body: Uint8Array;
    encodedVideoId: string;
};

type Encrypted = {
    encrypted: Uint8Array;
    hmac: Uint8Array;
    iv: Uint8Array;
};

export default class YoutubeOnesieProvider {
    cachedClientConfig: ClientConfig | undefined;
    innerTube: Innertube | undefined;
    public async getDownloadUrl(videoId: string): Promise<string> {
        if (!this.innerTube) {
            this.innerTube = await Innertube.create({
                cache: new UniversalCache(true),
            });
        }

        const videoInfo = await this.getBasicInfo(this.innerTube, videoId);
        const length = videoInfo.chooseFormat({
            format: "mp4",
            quality: "best",
            type: "audio",
        }).content_length;

        const url = `${videoInfo
            .chooseFormat({ format: "mp4", quality: "best", type: "audio" })
            .decipher(this.innerTube.session.player)}&range=0-${length}`;

        return url;
    }

    /**
     * Fetches and parses the YouTube TV client configuration.
     * Configurations from other clients can be used as well. I chose TVHTML5 for its simplicity.
     */
    private async getYouTubeTVClientConfig(): Promise<ClientConfig> {
        const tvConfigResponse = await fetch(
            "https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl",
            {
                method: "GET",
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
                },
            },
        );

        const tvConfig = await tvConfigResponse.text();
        if (!tvConfig.startsWith(")]}"))
            throw new Error(
                "Invalid response from YouTube TV config endpoint.",
            );

        const tvConfigJson = JSON.parse(tvConfig.slice(4));

        const webPlayerContextConfig =
            tvConfigJson.webPlayerContextConfig
                .WEB_PLAYER_CONTEXT_CONFIG_ID_LIVING_ROOM_WATCH;

        const onesieHotConfig = webPlayerContextConfig.onesieHotConfig;

        const clientKeyData = base64ToU8(onesieHotConfig.clientKey);
        const encryptedClientKey = base64ToU8(
            onesieHotConfig.encryptedClientKey,
        );

        const onesieUstreamerConfig = base64ToU8(
            onesieHotConfig.onesieUstreamerConfig,
        );

        const baseUrl = onesieHotConfig.baseUrl;

        return {
            clientKeyData,
            encryptedClientKey,
            onesieUstreamerConfig,
            baseUrl,
        };
    }

    private async prepareOnesieRequest(
        args: OnesieRequestArgs,
    ): Promise<OnesieRequest> {
        const { videoId, poToken, clientConfig, innertube } = args;
        const { clientKeyData, encryptedClientKey, onesieUstreamerConfig } =
            clientConfig;
        const clonedInnerTubeContext: Context = structuredClone(
            innertube.session.context,
        );

        // Change or remove these if you want to use a different client. I chose TVHTML5 purely for testing.
        clonedInnerTubeContext.client.clientName = Constants.CLIENTS.TV.NAME;
        clonedInnerTubeContext.client.clientVersion =
            Constants.CLIENTS.TV.VERSION;

        const params: Record<string, any> = {
            playbackContext: {
                contentPlaybackContext: {
                    vis: 0,
                    splay: false,
                    lactMilliseconds: "-1",
                    signatureTimestamp: innertube.session.player?.sts,
                },
            },
            videoId,
        };

        if (poToken) {
            params.serviceIntegrityDimensions = {};
            params.serviceIntegrityDimensions.poToken = poToken;
        }

        const playerRequestJson = {
            context: clonedInnerTubeContext,
            ...params,
        };

        const headers = [
            {
                name: "Content-Type",
                value: "application/json",
            },
            {
                name: "User-Agent",
                value: innertube.session.context.client.userAgent,
            },
            {
                name: "X-Goog-Visitor-Id",
                value: innertube.session.context.client.visitorData,
            },
        ];

        const onesieRequest = Protos.OnesiePlayerRequest.encode({
            url: "https://youtubei.googleapis.com/youtubei/v1/player?key=AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8",
            headers,
            body: JSON.stringify(playerRequestJson),
            proxiedByTrustedBandaid: true,
            field6: false,
        }).finish();

        const { encrypted, hmac, iv } = await this.encryptRequest(
            clientKeyData,
            onesieRequest,
        );

        const body = Protos.OnesieRequest.encode({
            urls: [],
            playerRequest: {
                encryptedClientKey,
                encryptedOnesiePlayerRequest: encrypted,
                enableCompression: false,
                hmac,
                iv,
                TQ: true,
                YP: true,
            },
            clientAbrState: {
                timeSinceLastManualFormatSelectionMs: 0,
                lastManualDirection: 0,
                quality: QUALITY.HD720,
                selectedQualityHeight: QUALITY.HD720,
                startTimeMs: 0,
                visibility: 0,
            },
            streamerContext: {
                field5: [],
                field6: [],
                poToken: poToken ? base64ToU8(poToken) : undefined,
                playbackCookie: undefined,
                clientInfo: {
                    clientName: 7,
                    clientVersion:
                        innertube.session.context.client.clientVersion,
                },
            },
            bufferedRanges: [],
            onesieUstreamerConfig,
        }).finish();

        const videoIdBytes = base64ToU8(videoId);
        const encodedVideoIdChars = [];

        for (const byte of videoIdBytes) {
            encodedVideoIdChars.push(byte.toString(16).padStart(2, "0"));
        }

        const encodedVideoId = encodedVideoIdChars.join("");

        return { body, encodedVideoId };
    }

    private async getBasicInfo(
        innertube: Innertube,
        videoId: string,
    ): Promise<YT.VideoInfo> {
        const redirectorResponse = await fetch(
            `https://redirector.googlevideo.com/initplayback?source=youtube&itag=0&pvi=0&pai=0&owc=yes&id=${Math.round(Math.random() * 1e5)}`,
            {
                method: "GET",
                redirect: "manual",
            },
        );

        const redirectorResponseUrl =
            redirectorResponse.headers.get("location");

        if (!redirectorResponseUrl)
            throw new Error("Invalid redirector response");

        if (!this.cachedClientConfig) {
            this.cachedClientConfig = await this.getYouTubeTVClientConfig();
        }

        const onesieRequest = await this.prepareOnesieRequest({
            videoId,
            clientConfig: this.cachedClientConfig,
            innertube,
        });

        let url = `${redirectorResponseUrl.split("/initplayback")[0]}${this.cachedClientConfig.baseUrl}`;

        const queryParams = [];
        queryParams.push(`id=${onesieRequest.encodedVideoId}`);
        queryParams.push("&opr=1");
        queryParams.push("&por=1");
        queryParams.push("rn=1");

        url += `&${queryParams.join("&")}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                accept: "*/*",
                "content-type": "text/plain",
            },
            referrer: "https://www.youtube.com/",
            body: onesieRequest.body,
        });

        const arrayBuffer = await response.arrayBuffer();
        const googUmp = new GoogleVideo.UMP(
            new GoogleVideo.ChunkedDataBuffer([new Uint8Array(arrayBuffer)]),
        );

        const onesie: (Protos.OnesieHeader & { data?: Uint8Array })[] = [];

        googUmp.parse((part) => {
            const data = part.data.chunks[0];
            switch (part.type) {
                case PART.SABR_ERROR:
                    logger.warn(
                        `[SABR_ERROR]: ${Protos.SabrError.decode(data!)}`,
                    );
                    break;
                case PART.ONESIE_HEADER:
                    onesie.push(Protos.OnesieHeader.decode(data!));
                    break;
                case PART.ONESIE_DATA:
                    onesie[onesie.length - 1]!.data = data;
                    break;
                default:
                    break;
            }
        });

        const onesiePlayerResponse = onesie.find(
            (header) => header.type === Protos.OnesieHeaderType.PLAYER_RESPONSE,
        );

        if (onesiePlayerResponse) {
            if (!onesiePlayerResponse.cryptoParams)
                throw new Error("Crypto params not found");

            const iv = onesiePlayerResponse.cryptoParams.iv;
            const hmac = onesiePlayerResponse.cryptoParams.hmac;
            const encrypted = onesiePlayerResponse.data;

            const decryptedData = await this.decryptResponse(
                iv,
                hmac,
                encrypted,
                this.cachedClientConfig.clientKeyData,
            );

            const onesieResponse =
                Protos.OnesiePlayerResponse.decode(decryptedData);

            if (onesieResponse.onesieProxyStatus !== 1)
                throw new Error("Proxy status not OK");

            if (onesieResponse.httpStatus !== 200)
                throw new Error("Status not OK");

            const playerResponse = {
                success: true,
                status_code: 200,
                data: JSON.parse(new TextDecoder().decode(onesieResponse.body)),
            };

            return new YT.VideoInfo([playerResponse], innertube.actions, "");
        }

        throw new Error("Player response not found");
    }

    private async encryptRequest(
        clientKey: Uint8Array,
        data: Uint8Array,
    ): Promise<Encrypted> {
        if (clientKey.length !== 32)
            throw new Error("Invalid client key length");

        const aesKeyData = clientKey.slice(0, 16);
        const hmacKeyData = clientKey.slice(16, 32);

        const iv = crypto.getRandomValues(new Uint8Array(16));
        const aesKey = await crypto.subtle.importKey(
            "raw",
            aesKeyData,
            { name: "AES-CTR", length: 128 },
            false,
            ["encrypt"],
        );

        const encrypted = new Uint8Array(
            await crypto.subtle.encrypt(
                { name: "AES-CTR", counter: iv, length: 128 },
                aesKey,
                data,
            ),
        );

        const hmacKey = await crypto.subtle.importKey(
            "raw",
            hmacKeyData,
            { name: "HMAC", hash: { name: "SHA-256" } },
            false,
            ["sign"],
        );

        const hmac = new Uint8Array(
            await crypto.subtle.sign(
                "HMAC",
                hmacKey,
                new Uint8Array([...encrypted, ...iv]),
            ),
        );

        return { encrypted, hmac, iv };
    }

    private async decryptResponse(
        iv?: Uint8Array,
        hmac?: Uint8Array,
        data?: Uint8Array,
        clientKeyData?: Uint8Array,
    ): Promise<Uint8Array> {
        if (!iv || !hmac || !data || !clientKeyData)
            throw new Error("Invalid input");

        const aesKey = await crypto.subtle.importKey(
            "raw",
            clientKeyData.slice(0, 16),
            { name: "AES-CTR", length: 128 },
            false,
            ["decrypt"],
        );

        const decryptedData = new Uint8Array(
            await crypto.subtle.decrypt(
                { name: "AES-CTR", counter: iv, length: 128 },
                aesKey,
                data,
            ),
        );

        const hmacKey = await crypto.subtle.importKey(
            "raw",
            clientKeyData.slice(16, 32),
            { name: "HMAC", hash: { name: "SHA-256" } },
            false,
            ["verify"],
        );

        const isValid = await crypto.subtle.verify(
            "HMAC",
            hmacKey,
            hmac,
            new Uint8Array([...data, ...iv]),
        );

        if (!isValid) throw new Error("HMAC verification failed");

        return decryptedData;
    }
}
