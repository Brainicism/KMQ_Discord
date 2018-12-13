module.exports = (message, command, gameSession) => {
    if (command.components.length === 0) {
        gameSession.resetBeginningCutoffYear();
        message.channel.send(`The new cutoff year is \`${gameSession.getBeginningCutoffYear()}\`.`);
    }
    else if (command.components.length !== 1 ||
        isNaN(command.components[0]) ||
        (command.components[0] > (new Date()).getFullYear()) ||
        (command.components[0] < gameSession.getDefaultBeginningCutoffYear())) {
        // Incorrectly-passed input or unrealistic cutoffs warn the user
        message.channel.send(`Please enter a valid cutoff year (\`${gameSession.getDefaultBeginningCutoffYear()} <= cutoff <= ${(new Date()).getFullYear()}\`).`);
    }
    else {
        gameSession.setBeginningCutoffYear(command.components[0]);
        message.channel.send(`The new cutoff year is \`${gameSession.getBeginningCutoffYear()}\`.`);
    }
}