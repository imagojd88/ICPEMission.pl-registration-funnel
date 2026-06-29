export declare class ContactDto {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: string;
}
export declare class ParticipantInputDto {
    type: 'adult' | 'child';
    firstName: string;
    lastName?: string;
    age: number;
    gender: 'F' | 'M' | 'other';
    dietary?: string;
}
export declare class OptionsDto {
    transport?: boolean;
    bedding?: boolean;
}
export declare class ConsentsDto {
    rodo: boolean;
    regulamin: boolean;
}
export declare class CreateRegistrationDto {
    instanceId: string;
    locale: 'pl' | 'en' | 'it';
    contact: ContactDto;
    participants: ParticipantInputDto[];
    preferredRoomId: string;
    dietaryNotes?: string;
    options?: OptionsDto;
    discountCode?: string;
    paymentMethod: 'ONLINE' | 'BANK_TRANSFER';
    consents: ConsentsDto;
}
