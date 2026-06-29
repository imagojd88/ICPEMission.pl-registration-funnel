import { RoomsService } from './rooms.service';
export declare class RoomsController {
    private readonly rooms;
    constructor(rooms: RoomsService);
    addRoomType(id: string, dto: Record<string, unknown>): Promise<any>;
    generateRooms(id: string): Promise<any[]>;
    getRoomTypes(id: string): Promise<any>;
}
