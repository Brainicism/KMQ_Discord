module.exports = ({ gameSession, message, command }) => {
    let selectedGenderArray = gameSession.setGender(command.components);
    if (selectedGenderArray) {
        let selectedGenderStr = "";
        for (let i = 0; i < selectedGenderArray.length; i++) {
            selectedGenderStr += `\`${selectedGenderArray[i]}\``;
            if (i === selectedGenderArray.length - 1) {
                break;
            }
            else if (i === selectedGenderArray.length - 2) {
                selectedGenderStr += " and ";
            }
            else {
                selectedGenderStr += ", ";
            }
        }
        message.channel.send(`Songs will be played from ${selectedGenderStr} artists.`);
    }
    else {
        message.channel.send(`Please enter valid genders only (\`male\`, \`female\`, and/or \`coed\`).`)
    }
}