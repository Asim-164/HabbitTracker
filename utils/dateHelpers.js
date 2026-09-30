function toDateString(date) {
    return date.toISOString().slice(0, 10);
}

function daysBetweenInclusive(fromStr, toStr) {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    const oneDay = 24 * 60 * 60 * 1000;

    return Math.round((to - from) / oneDay) + 1;
}

function isConsecutiveDay(previousDate, currentDate) {
    const prev = new Date(previousDate);
    const curr = new Date(currentDate);

    const oneDay = 24 * 60 * 60 * 1000;
    return (curr - prev) === oneDay;
}

function parseRange(query) {
    const today = toDateString(new Date());

    const to = query.to || today;
    const from = query.from || toDateString(
        new Date(new Date(to).getTime() - 6 * 24 * 60 * 60 * 1000)
    );

    if (from > to) {
        return { error: "from must be <= to" };
    }

    return { from, to, daysInRange: daysBetweenInclusive(from, to) };
}

module.exports = {
    toDateString,
    daysBetweenInclusive,
    isConsecutiveDay,
    parseRange
};