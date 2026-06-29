export type Localized = {
    pl?: string;
    en?: string;
    it?: string;
};
export type ContractInstanceStatus = 'OPEN' | 'CLOSED';
export type ContractRegStatus = 'CONFIRMED' | 'PENDING' | 'WAITLIST' | 'CANCELLED';
export type ContractPaymentStatus = 'PAID' | 'PENDING' | 'UNPAID' | 'REFUNDED';
export declare function toLocalized(title: unknown): Localized;
export declare function localizedName(name: unknown): string;
export declare function mapInstanceStatus(s: string): ContractInstanceStatus;
export declare function mapRegStatus(s: string): ContractRegStatus;
export declare function contractStatusToInternal(s: string): string;
export declare function contractStatusFilter(s: string): string[] | undefined;
export declare function mapPaymentStatus(regStatus: string, paymentStatus?: string): ContractPaymentStatus;
export declare function mapPaymentMethod(m?: string | null): string | undefined;
export declare function mapGender(g?: string | null): string | undefined;
export declare function mapParticipantType(t: string): 'adult' | 'child';
export declare function num(d: {
    toString(): string;
} | number | null | undefined): number;
export declare function iso(d: Date | string): string;
