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
exports.RsvpController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const rsvp_service_1 = require("./rsvp.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let RsvpController = class RsvpController {
    constructor(rsvp) {
        this.rsvp = rsvp;
    }
    create(dto) {
        return this.rsvp.create(dto);
    }
    findOne(id, token) {
        return this.rsvp.findById(id, token);
    }
    update(id, token, dto) {
        return this.rsvp.update(id, token, dto);
    }
    async getIcs(id, res) {
        const ics = await this.rsvp.getIcs(id);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="event-${id}.ics"`);
        res.send(ics);
    }
    async google(id, res) {
        res.redirect(302, await this.rsvp.getGoogleUrl(id));
    }
    list(id) {
        return this.rsvp.listForInstance(id);
    }
};
exports.RsvpController = RsvpController;
__decorate([
    (0, common_1.Post)('rsvp'),
    (0, swagger_1.ApiOperation)({ summary: 'Potwierdź obecność (Będę / Nie będę) — event standalone' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RsvpController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('rsvp/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Pobierz RSVP (magic-link)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RsvpController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)('rsvp/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Zmień odpowiedź RSVP (magic-link)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('token')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], RsvpController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('rsvp/:id/calendar.ics'),
    (0, swagger_1.ApiOperation)({ summary: 'Plik iCal dla RSVP' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RsvpController.prototype, "getIcs", null);
__decorate([
    (0, common_1.Get)('rsvp/:id/calendar/google'),
    (0, swagger_1.ApiOperation)({ summary: 'Redirect do Google Calendar' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RsvpController.prototype, "google", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Get)('admin/instances/:id/rsvps'),
    (0, swagger_1.ApiOperation)({ summary: 'Lista RSVP + liczniki (admin / Personal OS)' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RsvpController.prototype, "list", null);
exports.RsvpController = RsvpController = __decorate([
    (0, swagger_1.ApiTags)('rsvp'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [rsvp_service_1.RsvpService])
], RsvpController);
//# sourceMappingURL=rsvp.controller.js.map