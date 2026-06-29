import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly logger;
    constructor(prisma: PrismaService, jwt: JwtService);
    ensureBootstrap(): Promise<void>;
    loginAdmin(email: string, password: string): Promise<{
        accessToken: string;
        user: {
            id: any;
            email: any;
            role: any;
        };
    }>;
    validateServiceToken(token: string): Promise<{
        scopes: string[];
    } | null>;
}
