import * as uuid from "uuid";
import { EMBED_SUCCESS_COLOR, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getUserTag,
    sendDeprecatedTextCommandMessage,
    sendInfoWebhook,
} from "../../helpers/discord_utils";
import Eris from "eris";
import MessageContext from "../../structures/message_context";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "feedback";
const logger = new IPCLogger(COMMAND_NAME);

export default class FeedbackCommand implements BaseCommand {
    static FEEDBACK_QUESTIONS: {
        question: string;
        placeholder: string;
        required: boolean;
    }[] = [
        {
            question: "command.feedback.questions.likeKMQ.question",
            placeholder: "command.feedback.questions.likeKMQ.placeholder",
            required: false,
        },
        {
            question: "command.feedback.questions.improveKMQ.question",
            placeholder: "command.feedback.questions.improveKMQ.placeholder",
            required: true,
        },
    ];

    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.feedback.help.description",
        ),
        examples: [],
        priority: 500,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        logger.warn("Text-based command not supported for feedback");
        await sendDeprecatedTextCommandMessage(
            MessageContext.fromMessage(message),
        );
    };

    static sendFeedbackModal = async (
        interaction: Eris.CommandInteraction,
    ): Promise<void> => {
        await interaction.createModal({
            title: i18n.translate(
                interaction.guild?.id as string,
                "command.feedback.questions.title",
            ),
            custom_id: "feedback",
            components: FeedbackCommand.FEEDBACK_QUESTIONS.map(
                (feedbackQuestion) => ({
                    type: Eris.Constants.ComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: Eris.Constants.ComponentTypes.TEXT_INPUT,
                            style: Eris.Constants.TextInputStyles.PARAGRAPH,
                            custom_id: uuid.v4() as string,
                            label: i18n.translate(
                                interaction.guild?.id as string,
                                feedbackQuestion.question,
                            ),
                            placeholder: i18n.translate(
                                interaction.guild?.id as string,
                                feedbackQuestion.placeholder,
                            ),
                            required: feedbackQuestion.required,
                        },
                    ],
                }),
            ),
        });
    };

    /**
     * @param interaction - The interaction
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
    ): Promise<void> {
        await FeedbackCommand.sendFeedbackModal(interaction);
    }

    /**
     * Formats and delivers a feedback submission to the alert webhook. Shared
     * by the Discord modal handler and the web/Activity feedback endpoint so
     * the two produce identical webhook messages.
     * @param guildID - guild (or web room) ID used to localize the questions
     * @param userTag - display name of the submitter (Discord tag or web/guest
     * username)
     * @param userID - the submitter's user ID
     * @param answers - responses parallel-indexed to FEEDBACK_QUESTIONS;
     * undefined/empty entries are omitted
     */
    static submitFeedback = async (
        guildID: string,
        userTag: string,
        userID: string,
        answers: Array<string | undefined>,
    ): Promise<void> => {
        let feedbackResponse = `${new Date().toISOString()}\n${userTag} | ${userID}\n`;

        for (
            let questionIndex = 0;
            questionIndex < FeedbackCommand.FEEDBACK_QUESTIONS.length;
            questionIndex++
        ) {
            const answer = answers[questionIndex];
            if (answer === undefined || answer === "") {
                continue;
            }

            feedbackResponse += "--------------------------------\n";
            feedbackResponse += `Q${questionIndex + 1}. ${i18n.translate(
                guildID,
                FeedbackCommand.FEEDBACK_QUESTIONS[questionIndex]!.question,
            )}\n`;

            feedbackResponse += `${answer}\n`;
        }

        if (!process.env.ALERT_WEBHOOK_URL) {
            logger.warn("ALERT_WEBHOOK_URL not specified");
            logger.info(feedbackResponse);
            return;
        }

        await sendInfoWebhook(
            process.env.ALERT_WEBHOOK_URL,
            "KMQ Feedback",
            `\`\`\`\n${feedbackResponse}\n\`\`\``,
            EMBED_SUCCESS_COLOR,
            KmqImages.HAPPY,
            "Kimiqo",
        );

        logger.info(`Feedback logged by ${userID}`);
    };

    /**
     * Handles showing suggested artists as the user types for the include slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processModalSubmitInteraction(
        interaction: Eris.ModalSubmitInteraction,
    ): Promise<void> {
        const user = interaction.user as Eris.User;

        const answers = FeedbackCommand.FEEDBACK_QUESTIONS.map((_q, idx) => {
            const modalComponent = interaction.data.components[idx];
            if (
                modalComponent &&
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                modalComponent.type === Eris.Constants.ComponentTypes.ACTION_ROW
            ) {
                return modalComponent.components[0]!.value;
            }

            if (modalComponent) {
                logger.error(
                    `Unexpected modal component type in feedback: ${modalComponent.type}`,
                );
            }

            return undefined;
        });

        await FeedbackCommand.submitFeedback(
            interaction.guild?.id as string,
            await getUserTag(user.id),
            user.id,
            answers,
        );

        await interaction.acknowledge();
    }
}
