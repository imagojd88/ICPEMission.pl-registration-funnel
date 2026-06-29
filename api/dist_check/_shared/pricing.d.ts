import type { ParticipantType } from './types';
export interface PricedParticipant {
    type: ParticipantType;
    age: number;
}
export interface RoomTypeDef {
    id: string;
    name: string;
    desc?: string;
    cap: number;
    perPerson: number;
    model?: string;
    tag?: string;
}
export interface AgeBracket {
    ltAge: number;
    multiplier: number;
}
export interface PricingConfig {
    formationFee: number;
    mealsFee: number;
    nights: number;
    childBrackets: AgeBracket[];
    rooms: RoomTypeDef[];
    options: {
        transport: number;
        bedding: number;
    };
    discountCodes: Record<string, number>;
}
export declare const DEFAULT_PRICING: PricingConfig;
export interface PriceOptions {
    transport?: boolean;
    bedding?: boolean;
}
export interface PriceInput {
    participants: PricedParticipant[];
    roomId: string;
    options?: PriceOptions;
    discountCode?: string;
}
export interface PriceLine extends PricedParticipant {
    multiplier: number;
    total: number;
}
export interface PriceResult {
    participants: number;
    accommodation: number;
    options: number;
    discount: number;
    subtotal: number;
    total: number;
    lines: PriceLine[];
    currency: string;
}
export declare function ageMultiplier(p: PricedParticipant, brackets: AgeBracket[]): number;
export declare function computePrice(input: PriceInput, config?: PricingConfig): PriceResult;
export declare function formatZl(n: number): string;
