import * as uuid from "uuid";
import { IPCLogger } from "../../logger";
import { getUserTag } from "../../helpers/discord_utils";
import { pathExists } from "../../helpers/utils";
import Eris from "eris";
import fs from "fs";
import i18n from "../../helpers/localization_manager";
import path from "path";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("feedback");

const FEEDBACK_QUESTIONS: {
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

export default class FeedbackCommand implements BaseCommand {
    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): HelpDocumentation => ({
        description: i18n.translate(
            guildID,
            "command.feedback.help.description"
        ),
        examples: [],
        name: "feedback",
        priority: 500,
        usage: "/feedback",
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = (): void => {
        logger.warn("Text-based command not supported for feedback");
    };

    static sendFeedbackModal = async (
        interaction: Eris.CommandInteraction
    ): Promise<void> => {
        await interaction.createModal({
            title: i18n.translate(
                interaction.guildID as string,
                "command.feedback.questions.title"
            ),
            custom_id: "feedback",
            components: FEEDBACK_QUESTIONS.map((feedbackQuestion) => ({
                type: Eris.Constants.ComponentTypes.ACTION_ROW,
                components: [
                    {
                        type: Eris.Constants.ComponentTypes.TEXT_INPUT,
                        style: Eris.Constants.TextInputStyles.PARAGRAPH,
                        custom_id: uuid.v4() as string,
                        label: i18n.translate(
                            interaction.guildID as string,
                            feedbackQuestion.question
                        ),
                        placeholder: i18n.translate(
                            interaction.guildID as string,
                            feedbackQuestion.placeholder
                        ),
                        required: feedbackQuestion.required,
                    },
                ],
            })),
        });
    };

    /**
     * @param interaction - The interaction
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction
    ): Promise<void> {
        await FeedbackCommand.sendFeedbackModal(interaction);
    }

    /**
     * Handles showing suggested artists as the user types for the include slash command
     * @param interaction - The interaction with intermediate typing state
     */
    static async processModalSubmitInteraction(
        interaction: Eris.ModalSubmitInteraction
    ): Promise<void> {
        const user = interaction.user as Eris.User;
        let feedbackResponse = `${new Date().toISOString()}\n${await getUserTag(
            user.id
        )} | ${user.id}\n`;

        for (const [idx, modalComponent] of Object.entries(
            interaction.data.components
        )) {
            feedbackResponse += "--------------------------------\n";
            feedbackResponse += `Q${parseInt(idx, 10) + 1}. ${i18n.translate(
                interaction.guildID as string,
                FEEDBACK_QUESTIONS[idx].question
            )}\n`;
            feedbackResponse += `${modalComponent.components[0].value}\n`;
        }

        const FEEDBACK_DIR = path.join(__dirname, "../../../data/feedback");

        if (!(await pathExists(FEEDBACK_DIR))) {
            await fs.promises.mkdir(FEEDBACK_DIR);
        }

        const feedbackResponseFilePath = path.resolve(
            __dirname,
            FEEDBACK_DIR,
            `${new Date().toISOString()}-${user.id}.txt`
        );

        await fs.promises.writeFile(feedbackResponseFilePath, feedbackResponse);

        logger.info(`Feedback logged by ${user.id}`);
        await interaction.acknowledge();
    }
}
