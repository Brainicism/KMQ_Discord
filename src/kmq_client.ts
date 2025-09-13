/* eslint-disable no-await-in-loop */
import * as Eris from "eris";
import { IPCLogger } from "./logger.js";
import fs from "fs";
import path from "path";
import type BaseCommand from "./commands/interfaces/base_command.js";

const logger = new IPCLogger("kmq_client");

export default class KmqClient extends Eris.Client {
    public commands: { [commandName: string]: BaseCommand };
    public commandsHandlers: { [commandName: string]: BaseCommand };
    public aliases: { [aliasName: string]: BaseCommand };

    constructor(token: string, options: Eris.ClientOptions) {
        super(token, options);
        logger.info("Starting KMQ Client");
        this.commands = {};
        this.commandsHandlers = {};
        this.aliases = {};
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.registerCommands();
    }

    /**
     * @param shouldReload - Whether to reload the commands
     * @returns a mapping of command name to command source file
     * */
    public static async getCommandFiles(): Promise<{
        [commandName: string]: BaseCommand;
    }> {
        const commandMap: { [commandName: string]: any } = {};
        try {
            let files: Array<string> = [];
            for (const category of [
                "admin",
                "game_options",
                "game_commands",
                "misc_commands",
            ]) {
                files = files.concat(
                    (
                        await fs.promises.readdir(
                            path.resolve(
                                import.meta.dirname,
                                "./commands",
                                category,
                            ),
                        )
                    )
                        .filter((x) => x.endsWith(".ts") || x.endsWith(".js"))
                        .map((x) =>
                            path.resolve(
                                import.meta.dirname,
                                "./commands",
                                category,
                                x,
                            ),
                        ),
                );
            }

            for (const commandFile of files) {
                try {
                    // ESM dynamic import
                    const command = await import(commandFile);
                    const commandName = path.parse(commandFile).name;
                    commandMap[commandName] = new command.default(); // ESM default export
                } catch (e) {
                    throw new Error(
                        `Failed to load file: ${commandFile}. ${e}`,
                    );
                }
            }

            return commandMap;
        } catch (err) {
            logger.error(`Unable to read commands error = ${err}`);
            throw err;
        }
    }

    /** Reloads commands */
    public async reloadCommands(): Promise<void> {
        logger.info("Reloading KMQ commands");
        await this.registerCommands();
        logger.info("Reload KMQ commands complete");
    }

    /**
     *  Registers commands
     * @param initialLoad - Whether this is the initial load
     * */
    private async registerCommands(): Promise<void> {
        // load commands
        this.commands = {};
        const commandFiles = await KmqClient.getCommandFiles();
        let successfulCommands = 0;
        for (const [commandName, command] of Object.entries(commandFiles)) {
            if (this.registerCommand(command, commandName))
                successfulCommands++;
            if (command.aliases) {
                for (const alias of command.aliases) {
                    this.aliases[alias] = command;
                }
            }
        }

        logger.info(
            `Registered ${successfulCommands}/${
                Object.keys(commandFiles).length
            } commands.`,
        );
    }

    /**
     * Registers a command
     * @param command - The Command class
     * @param commandName - The name/alias of the command
     * @returns whether the command was registered
     */
    private registerCommand(
        command: BaseCommand,
        commandName: string,
    ): boolean {
        if (commandName in this.commands) {
            logger.error(
                `Command \`${commandName}\` already exists. Possible conflict?`,
            );
            return false;
        }

        this.commands[commandName] = command;
        this.commandsHandlers[commandName] = command;

        if (command.slashCommandAliases) {
            for (const slashCommandAlias of command.slashCommandAliases) {
                this.commandsHandlers[slashCommandAlias] = command;
            }
        }

        return true;
    }
}
