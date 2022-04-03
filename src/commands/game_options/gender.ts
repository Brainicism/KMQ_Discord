import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("gender");

export enum Gender {
    MALE = "male",
    FEMALE = "female",
    COED = "coed",
    ALTERNATING = "alternating",
}

export const DEFAULT_GENDER = [Gender.FEMALE, Gender.MALE, Gender.COED];

export default class GenderCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(Gender),
                name: "gender_1",
                type: "enum" as const,
            },
            {
                enums: Object.values(Gender).slice(0, 3),
                name: "gender_2",
                type: "enum" as const,
            },
            {
                enums: Object.values(Gender).slice(0, 3),
                name: "gender_3",
                type: "enum" as const,
            },
        ],
        maxArgCount: 3,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.gender.help.description",
            {
                coed: `\`${Gender.COED}\``,
                female: `\`${Gender.FEMALE}\``,
                genderAlternating: `\`${process.env.BOT_PREFIX}gender alternating\``,
                male: `\`${Gender.MALE}\``,
            }
        ),
        examples: [
            {
                example: "`,gender female`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.gender.help.example.female"
                ),
            },
            {
                example: "`,gender male female`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.gender.help.example.maleFemale"
                ),
            },
            {
                example: "`,gender coed`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.gender.help.example.coed"
                ),
            },
            {
                example: "`,gender`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.gender.help.example.reset"
                ),
            },
            {
                example: "`,gender alternating`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.gender.help.example.alternating"
                ),
            },
        ],
        name: "gender",
        priority: 150,
        usage: ",gender [gender_1 | alternating] {gender_2} {gender_3}",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const selectedGenders = parsedMessage.components as Array<Gender>;

        if (selectedGenders.length === 0) {
            await guildPreference.reset(GameOption.GENDER);
            await sendOptionsMessage(
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
                    description: state.localizer.translate(
                        message.guildID,
                        "misc.failure.gameOptionConflict.description",
                        {
                            optionOne: "`groups`",
                            optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                            optionTwo: "`gender`",
                        }
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.gameOptionConflict.title"
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
                    description: state.localizer.translate(
                        message.guildID,
                        "command.gender.warning.gameOption.description",
                        {
                            alternatingGenderCommand: `\`${process.env.BOT_PREFIX}gender alternating\``,
                        }
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "command.gender.warning.gameOption.title"
                    ),
                });
            }

            await guildPreference.setGender([selectedGenders[0]]);
        } else {
            await guildPreference.setGender(selectedGenders);
        }

        await sendOptionsMessage(
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
