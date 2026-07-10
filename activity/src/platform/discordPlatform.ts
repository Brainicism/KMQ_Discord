import type { AuthedSession } from "../discordSdk";

/**
 * Embedded-Activity platform adapter. Mirrors discordSdk.ts's API but loads
 * that module (and with it @discord/embedded-app-sdk) dynamically, so the
 * standalone-website target never downloads or evaluates the SDK. The
 * embedded iframe is the only caller of these functions.
 */

export async function authenticate(): Promise<AuthedSession> {
    const sdkModule = await import("../discordSdk");
    return sdkModule.authenticate();
}

export async function readSdkLocale(): Promise<string | null> {
    const sdkModule = await import("../discordSdk");
    return sdkModule.readSdkLocale();
}

export async function openExternalUrl(url: string): Promise<void> {
    const sdkModule = await import("../discordSdk");
    return sdkModule.openExternalUrl(url);
}
