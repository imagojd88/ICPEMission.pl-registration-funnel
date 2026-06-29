"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const events_module_1 = require("./events/events.module");
const pricing_module_1 = require("./pricing/pricing.module");
const registrations_module_1 = require("./registrations/registrations.module");
const rooms_module_1 = require("./rooms/rooms.module");
const payments_module_1 = require("./payments/payments.module");
const notifications_module_1 = require("./notifications/notifications.module");
const attendance_module_1 = require("./attendance/attendance.module");
const guests_module_1 = require("./guests/guests.module");
const admin_module_1 = require("./admin/admin.module");
const rsvp_module_1 = require("./rsvp/rsvp.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            events_module_1.EventsModule,
            pricing_module_1.PricingModule,
            registrations_module_1.RegistrationsModule,
            rooms_module_1.RoomsModule,
            payments_module_1.PaymentsModule,
            notifications_module_1.NotificationsModule,
            attendance_module_1.AttendanceModule,
            guests_module_1.GuestsModule,
            admin_module_1.AdminModule,
            rsvp_module_1.RsvpModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map