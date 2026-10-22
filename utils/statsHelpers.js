const { toDateString } = require("./dateHelpers");

function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function isoWeekLabel(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function tierFromValue(value, thresholds) {
    const tiers = ["bronze", "silver", "gold"];
    let currentTier = null;
    let nextThreshold = thresholds[0];
    let nextTier = "bronze";

    for (let i = 0; i < thresholds.length; i++) {
        if (value >= thresholds[i]) {
            currentTier = tiers[i];
        } else {
            nextThreshold = thresholds[i];
            nextTier = tiers[i];
            break;
        }
    }

    if (currentTier === "gold") {
        return { currentTier, progressValue: value, nextThreshold: null, nextTier: null };
    }

    return { currentTier, progressValue: value, nextThreshold, nextTier };
}

module.exports = { localDateStr, isoWeekLabel, tierFromValue };