class PerformanceTimer {

    constructor() {
        this.timers = new Map();
    }

    start(label) {
        this.timers.set(label, process.hrtime.bigint());
    }

    end(label) {

        const start = this.timers.get(label);

        if (!start) return;

        const end = process.hrtime.bigint();

        const ms = Number(end - start) / 1000000;

        console.log(
            `⏱ ${label}: ${ms.toFixed(2)} ms`
        );

        this.timers.delete(label);

    }

}

module.exports = new PerformanceTimer();