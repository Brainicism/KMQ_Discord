// import { KmqImages } from "../../constants";
// import { sendInfoMessage } from "../../helpers/discord_utils";
// import { isUserPremium } from "../../helpers/game_utils";
import CommandArgs from "../../interfaces/command_args";
import HelpDocumentation from "../../interfaces/help";
import { state } from "../../kmq_worker";
// import MessageContext from "../../structures/message_context";
import BaseCommand from "../interfaces/base_command";

export default class PremiumCommand implements BaseCommand {
    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): HelpDocumentation => ({
        description: state.localizer.translate(
            guildID,
            "command.premium.help.description"
        ),
        examples: [
            {
                example: "`,premium`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.premium.help.example"
                ),
            },
        ],
        name: "premium",
        priority: 50,
        usage: ",premium",
    });

    call = ({}: CommandArgs): Promise<void> => {
        // Temporarily disable premium command
        return;
        // call = async ({ message }: CommandArgs): Promise<void> => {
        // const premiumMember = await isUserPremium(message.author.id);
        // sendInfoMessage(MessageContext.fromMessage(message), {
        //     description: `${state.localizer.translate(
        //         message.guildID,
        //         premiumMember
        //             ? "command.premium.status.description.premium"
        //             : "command.premium.status.description.nonPremium"
        //     )}\n\n${state.localizer.translate(
        //         message.guildID,
        //         "command.premium.status.description.connectionReminder"
        //     )}`,
        //     fields: [
        //         {
        //             name: state.localizer.translate(
        //                 message.guildID,
        //                 "command.premium.status.perks.moreSongs.title"
        //             ),
        //             value: state.localizer.translate(
        //                 message.guildID,
        //                 "command.premium.status.perks.moreSongs.description"
        //             ),
        //         },
        //         {
        //             name: state.localizer.translate(
        //                 message.guildID,
        //                 "command.premium.status.perks.special.title"
        //             ),
        //             value: state.localizer.translate(
        //                 message.guildID,
        //                 "command.premium.status.perks.special.description"
        //             ),
        //         },
        //         {
        //             name: state.localizer.translate(
        //                 message.guildID,
        //                 "command.premium.status.perks.badge.title"
        //             ),
        //             value: state.localizer.translate(
        //                 message.guildID,
        //                 "command.premium.status.perks.badge.description"
        //             ),
        //         },
        //     ],
        //     thumbnailUrl: KmqImages.HAPPY,
        //     title: state.localizer.translate(
        //         message.guildID,
        //         premiumMember
        //             ? "command.premium.status.title.premium"
        //             : "command.premium.status.title.nonPremium"
        //     ),
        // });
    };
}
