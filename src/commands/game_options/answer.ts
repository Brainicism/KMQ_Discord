import { AnswerType } from "../../enums/option_types/answer_type";
import { GameOption } from "../../enums/game_option_name";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("answer");

export default class AnswerCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "answerType",
                type: "enum" as const,
                enums: Object.values(AnswerType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "answer",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.answer.help.description",
            {
                typing: `\`${AnswerType.TYPING}\``,
                typingtypos: `\`${AnswerType.TYPING_TYPOS}\``,
                easy: `\`${AnswerType.MULTIPLE_CHOICE_EASY}\``,
                medium: `\`${AnswerType.MULTIPLE_CHOICE_MED}\``,
                hard: `\`${AnswerType.MULTIPLE_CHOICE_HARD}\``,
            }
        ),
        usage: ",answer [typing | typingtypos | easy | medium | hard]",
        examples: [
            {
                example: "`,answer typing`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.typing"
                ),
            },
            {
                example: "`,answer typingtypos`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.typingTypos"
                ),
            },
            {
                example: "`,answer easy`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    { optionCount: String(4), penalty: "0.25x" }
                ),
            },
            {
                example: "`,answer medium`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    { optionCount: String(6), penalty: "0.5x" }
                ),
            },
            {
                example: "`,answer hard`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    { optionCount: String(8), penalty: "0.75x" }
                ),
            },
        ],
        priority: 150,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.ANSWER_TYPE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.ANSWER_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Answer type reset.`);
            return;
        }

        const answerType = parsedMessage.components[0] as AnswerType;
        await guildPreference.setAnswerType(answerType);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.ANSWER_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Answer type set to ${answerType}`
        );
    };
}
