/* eslint-disable import/no-dynamic-require */
import Eris from "eris";
import fs from "fs";
import path from "path";
import BaseCommand from "./commands/interfaces/base_command";
import { IPCLogger } from "./logger";

const logger = new IPCLogger("kmq_client");

export default class KmqClient extends Eris.Client {
    public commands: { [commandName: string]: BaseCommand };

    constructor(token, options) {
        super(token, options);
        logger.info("Starting KMQ Client");
        this.commands = {};
        this.registerCommands(true);
    }

    /** @returns a mapping of command name to command source file */
    public static getCommandFiles(shouldReload: boolean): {
        [commandName: string]: BaseCommand;
    } {
        const commandMap = {};
        try {
            let files: Array<string> = [];
            for (const category of ["admin", "game_options", "game_commands"]) {
                files = files.concat(
                    fs
                        .readdirSync(
                            path.resolve(__dirname, "./commands", category)
                        )
                        .filter((x) => x.endsWith(".js"))
                        .map((x) =>
                            path.resolve(__dirname, "./commands", category, x)
                        )
                );
            }

            for (const commandFile of files) {
                const commandFilePath = path.resolve(
                    __dirname,
                    "./commands",
                    commandFile
                );

                if (shouldReload) {
                    // invalidate require cache
                    delete require.cache[require.resolve(commandFilePath)];
                }

                try {
                    // eslint-disable-next-line global-require
                    const command = require(commandFilePath);
                    const commandName = path.parse(commandFile).name;
                    // eslint-disable-next-line new-cap
                    commandMap[commandName] = new command.default();
                } catch (e) {
                    throw new Error(`Failed to load file: ${commandFilePath}`);
                }
            }

            return commandMap;
        } catch (err) {
            logger.error(`Unable to read commands error = ${err}`);
            throw err;
        }
    }

    /** Reloads commands */
    public reloadCommands(): void {
        logger.info("Reloading KMQ commands");
        this.registerCommands(false);
        logger.info("Reload KMQ commands complete");
    }

    /** Registers commands */
    private registerCommands(initialLoad: boolean): void {
        // load commands
        this.commands = {};
        const commandFiles = KmqClient.getCommandFiles(!initialLoad);
        let successfulCommands = 0;
        for (const [commandName, command] of Object.entries(commandFiles)) {
            if (this.registerCommand(command, commandName))
                successfulCommands++;
            if (command.aliases) {
                for (const alias of command.aliases) {
                    this.registerCommand(command, alias);
                }
            }
        }

        logger.info(
            `Registered ${successfulCommands}/${
                Object.keys(commandFiles).length
            } commands.`
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
        commandName: string
    ): boolean {
        if (commandName in this.commands) {
            logger.error(
                `Command \`${commandName}\` already exists. Possible conflict?`
            );
            return false;
        }

        this.commands[commandName] = command;
        return true;
    }
}
