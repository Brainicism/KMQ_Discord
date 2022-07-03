import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GameOption from "../../enums/game_option_name";
import Gender from "../../enums/option_types/gender";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("gender");

export default class GenderCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [
            {
                name: "gender_1",
                type: "enum" as const,
                enums: Object.values(Gender),
            },
            {
                name: "gender_2",
                type: "enum" as const,
                enums: Object.values(Gender).slice(0, 3),
            },
            {
                name: "gender_3",
                type: "enum" as const,
                enums: Object.values(Gender).slice(0, 3),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "gender",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.gender.help.description",
            {
                male: `\`${Gender.MALE}\``,
                female: `\`${Gender.FEMALE}\``,
                coed: `\`${Gender.COED}\``,
                genderAlternating: `\`${process.env.BOT_PREFIX}gender alternating\``,
            }
        ),
        usage: ",gender [gender_1 | alternating] {gender_2} {gender_3}",
        examples: [
            {
                example: "`,gender female`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.female"
                ),
            },
            {
                example: "`,gender male female`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.maleFemale"
                ),
            },
            {
                example: "`,gender coed`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.coed"
                ),
            },
            {
                example: "`,gender`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.reset"
                ),
            },
            {
                example: "`,gender alternating`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.gender.help.example.alternating"
                ),
            },
        ],
        priority: 150,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        const selectedGenders = parsedMessage.components as Array<Gender>;

        if (selectedGenders.length === 0) {
            await guildPreference.reset(GameOption.GENDER);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.GENDER, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Gender reset.`);
            return;
        }

        if (guildPreference.isGroupsMode() && selectedGenders.length >= 1) {
            // Incompatibility between groups and gender doesn't exist in GENDER.ALTERNATING
            if (selectedGenders[0] !== Gender.ALTERNATING) {
                logger.warn(
                    `${getDebugLogHeader(
                        message
                    )} | Game option conflict between gender and groups.`
                );

                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.gameOptionConflict.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.gameOptionConflict.description",
                        {
                            optionOne: "`groups`",
                            optionTwo: "`gender`",
                            optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                        }
                    ),
                });
                return;
            }
        }

        if (selectedGenders[0] === Gender.ALTERNATING) {
            if (
                guildPreference.isGroupsMode() &&
                guildPreference.getGroupIDs().length === 1
            ) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.gender.warning.gameOption.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.gender.warning.gameOption.description",
                        {
                            alternatingGenderCommand: `\`${process.env.BOT_PREFIX}gender alternating\``,
                        }
                    ),
                });
            }

            await guildPreference.setGender([selectedGenders[0]]);
        } else {
            await guildPreference.setGender(selectedGenders);
        }

        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.GENDER, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Genders set to ${guildPreference.gameOptions.gender.join(
                ", "
            )}`
        );
    };
}
