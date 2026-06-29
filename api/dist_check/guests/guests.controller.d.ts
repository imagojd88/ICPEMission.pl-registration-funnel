import { GuestsService } from './guests.service';
export declare class GuestsController {
    private readonly guests;
    constructor(guests: GuestsService);
    register(dto: {
        email: string;
        password?: string;
        firstName: string;
        lastName: string;
        phone?: string;
        locale?: string;
    }): Promise<any>;
    login(_dto: {
        email: string;
        password: string;
    }): {
        message: string;
    };
    magicLink(_dto: {
        email: string;
    }): {
        message: string;
    };
    myRegistrations(): {
        message: string;
    };
    updateProfile(_dto: unknown): {
        message: string;
    };
}
