function calculateFinalScore(ruleScore, confidence) {

    return Number(
        (
            ruleScore * 0.4 +
            confidence * 0.6
        ).toFixed(2)
    );

}

module.exports = {
    calculateFinalScore
};