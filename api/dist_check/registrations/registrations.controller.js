"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const registrations_service_1 = require("./registrations.service");
const create_registration_dto_1 = require("./dto/create-registration.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let RegistrationsController = class RegistrationsController {
    constructor(regs) {
        this.regs = regs;
    }
    create(dto) {
        return this.regs.create(dto);
    }
    findOne(id, token) {
        return this.regs.findById(id, token);
    }
    update(id, token, dto) {
        return this.regs.update(id, token, dto);
    }
    async getIcs(id, res) {
        const ics = await this.regs.getIcs(id);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="event-${id}.ics"`);
        res.send(ics);
    }
    async getGoogleCalendar(id, res) {
        const url = await this.regs.getGoogleCalendarUrl(id);
        res.redirect(302, url);
    }
    listForInstance(id, status, q) {
        return this.regs.listForInstance(id, status, q);
    }
};
exports.RegistrationsController = RegistrationsController;
__decorate([
    (0, common_1.Post)('registrations'),
    (0, swagger_1.ApiOperation)({ summary: 'Create registration (binding price computed server-side)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_registration_dto_1.CreateRegistrationDto]),
    __metadata("design:returntype", void 0)
], RegistrationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('registrations/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get registration by magic-link token' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RegistrationsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)('registrations/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update registration (magic-link)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('token')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], RegistrationsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('registrations/:id/calendar.ics'),
    (0, swagger_1.ApiOperation)({ summary: 'Download iCal file' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RegistrationsController.prototype, "getIcs", null);
__decorate([
    (0, common_1.Get)('registrations/:id/calendar/google'),
    (0, swagger_1.ApiOperation)({ summary: 'Redirect to Google Calendar add-event' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RegistrationsController.prototype, "getGoogleCalendar", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Get)('admin/instances/:id/registrations'),
    (0, swagger_1.ApiOperation)({ summary: 'List registrations for instance (admin)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], RegistrationsController.prototype, "listForInstance", null);
exports.RegistrationsController = RegistrationsController = __decorate([
    (0, swagger_1.ApiTags)('registrations'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [registrations_service_1.RegistrationsService])
], RegistrationsController);
//# sourceMappingURL=registrations.controller.js.map