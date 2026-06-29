import { AuthService } from './auth.service';
declare class AdminLoginDto {
    email: string;
    password: string;
}
export declare class AuthController {
    private readonly auth;
    constructor(auth: AuthService);
    loginAdmin(dto: AdminLoginDto): Promise<{
        accessToken: string;
        user: {
            id: any;
            email: any;
            role: any;
        };
    }>;
}
export {};
