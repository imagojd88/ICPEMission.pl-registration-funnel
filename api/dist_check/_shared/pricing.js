"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PRICING = void 0;
exports.ageMultiplier = ageMultiplier;
exports.computePrice = computePrice;
exports.formatZl = formatZl;
exports.DEFAULT_PRICING = {
    formationFee: 50,
    mealsFee: 80,
    nights: 1,
    childBrackets: [
        { ltAge: 3, multiplier: 0 },
        { ltAge: 12, multiplier: 0.7 },
        { ltAge: 18, multiplier: 0.9 },
    ],
    rooms: [
        { id: 'double', name: 'Miejsce w pokoju 2-osobowym', desc: 'Wspólny pokój dla dwóch osób — najczęstszy wybór.', cap: 2, perPerson: 80, model: 'os / noc', tag: 'Najpopularniejsze' },
        { id: 'single', name: 'Pokój 1-osobowy', desc: 'Prywatny pokój dla osób potrzebujących ciszy i skupienia.', cap: 1, perPerson: 100, model: 'noc', tag: '' },
        { id: 'family', name: 'Pokój rodzinny (4 os.)', desc: 'Większy pokój dla rodziny z dziećmi, dwa łóżka + dostawki.', cap: 4, perPerson: 70, model: 'os / noc', tag: 'Dla rodzin' },
    ],
    options: { transport: 40, bedding: 15 },
    discountCodes: { ICPE10: 0.1 },
};
function ageMultiplier(p, brackets) {
    if (p.type === 'child') {
        for (const b of brackets) {
            if (p.age < b.ltAge)
                return b.multiplier;
        }
    }
    return 1;
}
function computePrice(input, config = exports.DEFAULT_PRICING) {
    const room = config.rooms.find((r) => r.id === input.roomId) ?? config.rooms[0];
    let fee = 0;
    let acc = 0;
    let meals = 0;
    const lines = input.participants.map((p) => {
        const m = ageMultiplier(p, config.childBrackets);
        const f = config.formationFee * m;
        const a = room.perPerson * config.nights * m;
        const ml = config.mealsFee * m;
        fee += f;
        acc += a;
        meals += ml;
        return { ...p, multiplier: m, total: f + a + ml };
    });
    let opts = 0;
    if (input.options?.transport)
        opts += config.options.transport;
    if (input.options?.bedding)
        opts += config.options.bedding * input.participants.length;
    const participants = fee + meals;
    const subtotal = participants + acc + opts;
    const code = (input.discountCode ?? '').trim().toUpperCase();
    const frac = config.discountCodes[code] ?? 0;
    const discount = frac > 0 ? Math.round(subtotal * frac) : 0;
    return {
        participants,
        accommodation: acc,
        options: opts,
        discount,
        subtotal,
        total: subtotal - discount,
        lines,
        currency: 'PLN',
    };
}
function formatZl(n) {
    return new Intl.NumberFormat('pl-PL').format(Math.round(n)) + ' zł';
}
//# sourceMappingURL=pricing.js.map