import * as uuid from "uuid";
import { IPCLogger } from "../../logger";
import {
    getUserTag,
    sendDeprecatedTextCommandMessage,
} from "../../helpers/discord_utils";
import { pathExists } from "../../helpers/utils";
import Eris from "eris";
import MessageContext from "../../structures/message_context";
import fs from "fs";
import i18n from "../../helpers/localization_manager";
import path from "path";
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
                interaction.guildID as string,
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
                                interaction.guildID as string,
                                feedbackQuestion.question,
                            ),
                            placeholder: i18n.translate(
                                interaction.guildID as string,
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
     * Handles showing suggested artists as the user types for the include slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processModalSubmitInteraction(
        interaction: Eris.ModalSubmitInteraction,
    ): Promise<void> {
        const user = interaction.user as Eris.User;
        let feedbackResponse = `${new Date().toISOString()}\n${await getUserTag(
            user.id,
        )} | ${user.id}\n`;

        for (const [idx, modalComponent] of Object.entries(
            interaction.data.components,
        )) {
            const questionIndex = parseInt(idx, 10);
            feedbackResponse += "--------------------------------\n";
            feedbackResponse += `Q${questionIndex + 1}. ${i18n.translate(
                interaction.guildID as string,
                FeedbackCommand.FEEDBACK_QUESTIONS[questionIndex]!.question,
            )}\n`;
            feedbackResponse += `${modalComponent.components[0]!.value}\n`;
        }

        const FEEDBACK_DIR = path.join(__dirname, "../../../data/feedback");

        if (!(await pathExists(FEEDBACK_DIR))) {
            await fs.promises.mkdir(FEEDBACK_DIR);
        }

        const feedbackResponseFilePath = path.resolve(
            __dirname,
            FEEDBACK_DIR,
            `${new Date().toISOString()}-${user.id}.txt`,
        );

        await fs.promises.writeFile(feedbackResponseFilePath, feedbackResponse);

        logger.info(`Feedback logged by ${user.id}`);
        await interaction.acknowledge();
    }
}
