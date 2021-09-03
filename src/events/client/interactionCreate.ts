import Eris from "eris";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import { getUserTag, tryInteractionAcknowledge, tryCreateInteractionErrorAcknowledgement } from "../../helpers/discord_utils";
import { state } from "../../kmq";
import { handleProfileInteraction } from "../../commands/game_commands/profile";

export const BOOKMARK_COMMAND_NAME = "Bookmark Song";
export const PROFILE_COMMAND_NAME = "Profile";

export default async function interactionCreateHandler(interaction: Eris.PingInteraction | Eris.CommandInteraction | Eris.ComponentInteraction | Eris.UnknownInteraction) {
    if (interaction instanceof Eris.ComponentInteraction) {
        const gameSession = state.gameSessions[interaction.guildID];
        if (!gameSession || !gameSession.gameRound) {
            tryInteractionAcknowledge(interaction);
            return;
        }

        const messageContext = new MessageContext(
            interaction.channel.id,
            new KmqMember(interaction.member.username, getUserTag(interaction.member), interaction.member.avatarURL, interaction.member.id),
            interaction.guildID,
        );

        gameSession.handleMultipleChoiceInteraction(interaction, messageContext);
    } else if (interaction instanceof Eris.CommandInteraction) {
        if (interaction.data.type === Eris.Constants.ApplicationCommandTypes.USER) {
            if (interaction.data.name === PROFILE_COMMAND_NAME) {
                const user = await state.ipc.fetchUser(interaction.data.target_id);
                handleProfileInteraction(interaction, user);
            }
        } else if (interaction.data.type === Eris.Constants.ApplicationCommandTypes.MESSAGE) {
            if (interaction.data.name === BOOKMARK_COMMAND_NAME) {
                const gameSession = state.gameSessions[interaction.guildID];
                if (!gameSession) {
                    tryCreateInteractionErrorAcknowledgement(interaction, "You can only bookmark songs during a game.");
                    return;
                }

                gameSession.handleBookmarkInteraction(interaction);
            }
        }
    }
}
