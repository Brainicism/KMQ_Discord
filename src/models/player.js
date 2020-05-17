module.exports = class Player {
    constructor(name) {
        this._name = name;
        this._score = 1;
    }

    getName() {
        return this._name;
    }

    getScore() {
        return this._score;
    }

    incrementScore() {
        this._score++;
    }
};
