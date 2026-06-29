"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLocalized = toLocalized;
exports.localizedName = localizedName;
exports.mapInstanceStatus = mapInstanceStatus;
exports.mapRegStatus = mapRegStatus;
exports.contractStatusToInternal = contractStatusToInternal;
exports.contractStatusFilter = contractStatusFilter;
exports.mapPaymentStatus = mapPaymentStatus;
exports.mapPaymentMethod = mapPaymentMethod;
exports.mapGender = mapGender;
exports.mapParticipantType = mapParticipantType;
exports.num = num;
exports.iso = iso;
function toLocalized(title) {
    if (typeof title === 'string')
        return { pl: title };
    const t = (title ?? {});
    return { pl: t.pl, en: t.en, it: t.it };
}
function localizedName(name) {
    if (typeof name === 'string')
        return name;
    const n = (name ?? {});
    return n.pl ?? n.en ?? n.it ?? '';
}
function mapInstanceStatus(s) {
    return s === 'OPEN' ? 'OPEN' : 'CLOSED';
}
function mapRegStatus(s) {
    switch (s) {
        case 'CONFIRMED':
            return 'CONFIRMED';
        case 'WAITLIST':
            return 'WAITLIST';
        case 'CANCELLED':
            return 'CANCELLED';
        default:
            return 'PENDING';
    }
}
function contractStatusToInternal(s) {
    switch (s) {
        case 'PENDING':
            return 'PENDING_PAYMENT';
        case 'CONFIRMED':
        case 'WAITLIST':
        case 'CANCELLED':
            return s;
        default:
            return s;
    }
}
function contractStatusFilter(s) {
    switch (s) {
        case 'CONFIRMED':
            return ['CONFIRMED'];
        case 'WAITLIST':
            return ['WAITLIST'];
        case 'CANCELLED':
            return ['CANCELLED'];
        case 'PENDING':
            return ['DRAFT', 'PENDING_PAYMENT', 'AWAITING_TRANSFER'];
        default:
            return undefined;
    }
}
function mapPaymentStatus(regStatus, paymentStatus) {
    if (paymentStatus === 'PAID')
        return 'PAID';
    if (paymentStatus === 'REFUNDED')
        return 'REFUNDED';
    if (paymentStatus === 'PENDING' ||
        paymentStatus === 'AWAITING_TRANSFER' ||
        regStatus === 'PENDING_PAYMENT' ||
        regStatus === 'AWAITING_TRANSFER') {
        return 'PENDING';
    }
    return 'UNPAID';
}
function mapPaymentMethod(m) {
    if (!m)
        return undefined;
    if (m === 'BANK_TRANSFER')
        return 'transfer';
    if (m === 'ONLINE')
        return 'card';
    return m.toLowerCase();
}
function mapGender(g) {
    if (!g)
        return undefined;
    if (g === 'FEMALE' || g === 'F')
        return 'F';
    if (g === 'MALE' || g === 'M')
        return 'M';
    return 'other';
}
function mapParticipantType(t) {
    return t === 'CHILD' || t === 'child' ? 'child' : 'adult';
}
function num(d) {
    if (d === null || d === undefined)
        return 0;
    return typeof d === 'number' ? d : parseFloat(d.toString());
}
function iso(d) {
    return typeof d === 'string' ? new Date(d).toISOString() : d.toISOString();
}
//# sourceMappingURL=personal-os.mapper.js.map