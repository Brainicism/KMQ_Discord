import CommandArgs from "./command_args";

export default interface CallFunc {
    (args: CommandArgs): Promise<void>;
}
