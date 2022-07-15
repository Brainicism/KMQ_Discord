import {
    EMBED_SUCCESS_BONUS_COLOR,
    KmqImages,
    REVIEW_LINK,
    VOTE_BONUS_DURATION,
    VOTE_LINK,
    VOTE_RESET_DURATION,
} from "../../constants";
import { IPCLogger } from "../../logger";
import { bold } from "../../helpers/utils";
import {
    getDebugLogHeader,
    sendInfoMessage,
    tryCreateInteractionCustomPayloadAcknowledgement,
} from "../../helpers/discord_utils";
import { userBonusIsActive } from "../../helpers/game_utils";
import Eris from "eris";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import dbContext from "../../database_context";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("vote");

export default class VoteCommand implements BaseCommand {
    aliases = ["v", "voted"];

    help = (guildID: string): HelpDocumentation => ({
        name: "vote",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.vote.help.description"
        ),
        usage: ",vote",
        examples: [],
        priority: 60,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "vote",
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.vote.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await VoteCommand.sendVoteMessage(MessageContext.fromMessage(message));
    };

    static async sendVoteMessage(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        let voteStatusString = "";
        const boostActive = await userBonusIsActive(messageContext.author.id);
        const userVoterStatus = await dbContext
            .kmq("top_gg_user_votes")
            .where("user_id", "=", messageContext.author.id)
            .first();

        if (boostActive) {
            const timeRemaining =
                new Date(
                    userVoterStatus["buff_expiry_date"] - Date.now()
                ).getTime() /
                (1000 * 60);

            voteStatusString = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.vote.timeLeft",
                {
                    time: bold(
                        LocalizationManager.localizer.translateN(
                            messageContext.guildID,
                            "misc.plural.minute",
                            Math.max(Math.ceil(timeRemaining), 0)
                        )
                    ),
                }
            );
        } else if (userVoterStatus) {
            // User has voted before
            const nextVoteTime = new Date(userVoterStatus["buff_expiry_date"]);
            nextVoteTime.setHours(
                nextVoteTime.getHours() +
                    VOTE_RESET_DURATION -
                    VOTE_BONUS_DURATION
            );
            if (nextVoteTime.getTime() <= Date.now()) {
                voteStatusString = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.vote.available"
                );
            } else {
                const hoursLeft = Math.floor(
                    (nextVoteTime.getTime() - Date.now()) / (60 * 60 * 1000)
                );

                const minutesLeft = new Date(
                    nextVoteTime.getTime() - Date.now()
                ).getMinutes();

                const secondsLeft = new Date(
                    nextVoteTime.getTime() - Date.now()
                ).getSeconds();

                if (hoursLeft > 0) {
                    voteStatusString = LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.vote.unavailable.hours",
                        {
                            hours: LocalizationManager.localizer.translateN(
                                messageContext.guildID,
                                "misc.plural.hour",
                                hoursLeft
                            ),
                        }
                    );
                } else if (minutesLeft > 0) {
                    voteStatusString = LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.vote.unavailable.minutes",
                        {
                            minutes: LocalizationManager.localizer.translateN(
                                messageContext.guildID,
                                "misc.plural.minute",
                                minutesLeft
                            ),
                        }
                    );
                } else {
                    voteStatusString = LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.vote.unavailable.seconds",
                        {
                            seconds: LocalizationManager.localizer.translateN(
                                messageContext.guildID,
                                "misc.plural.second",
                                secondsLeft
                            ),
                        }
                    );
                }
            }
        } else {
            voteStatusString = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.vote.available"
            );
        }

        const embedPayload: EmbedPayload = {
            color: boostActive ? EMBED_SUCCESS_BONUS_COLOR : null,
            title: boostActive
                ? LocalizationManager.localizer.translate(
                      messageContext.guildID,
                      "command.vote.boost.active"
                  )
                : LocalizationManager.localizer.translate(
                      messageContext.guildID,
                      "command.vote.boost.inactive"
                  ),
            description: `${voteStatusString}\n\n${LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.vote.description",
                {
                    voteLink: VOTE_LINK,
                    voteResetDuration: String(VOTE_RESET_DURATION),
                    reviewLink: REVIEW_LINK,
                }
            )} `,
            thumbnailUrl: KmqImages.THUMBS_UP,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: Eris.Constants.ComponentTypes.BUTTON,
                            style: Eris.Constants.ButtonStyles.LINK,
                            url: VOTE_LINK,
                            emoji: { name: "✅" },
                            label: LocalizationManager.localizer.translate(
                                messageContext.guildID,
                                "misc.interaction.vote"
                            ),
                        },
                        {
                            type: Eris.Constants.ComponentTypes.BUTTON,
                            style: Eris.Constants.ButtonStyles.LINK,
                            url: REVIEW_LINK,
                            emoji: { name: "📖" },
                            label: LocalizationManager.localizer.translate(
                                messageContext.guildID,
                                "misc.interaction.leaveReview"
                            ),
                        },
                    ],
                },
            ],
        };

        if (interaction) {
            await tryCreateInteractionCustomPayloadAcknowledgement(
                messageContext,
                interaction,
                embedPayload
            );
        } else {
            sendInfoMessage(messageContext, embedPayload, true);
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Vote instructions retrieved.`
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await VoteCommand.sendVoteMessage(messageContext, interaction);
    }
}
