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
exports.GuestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const guests_service_1 = require("./guests.service");
let GuestsController = class GuestsController {
    constructor(guests) {
        this.guests = guests;
    }
    register(dto) {
        return this.guests.register(dto);
    }
    login(_dto) {
        return { message: 'Guest login not yet implemented — use magic-link' };
    }
    magicLink(_dto) {
        return { message: 'Magic link sent (stub — MAIL_MODE=log)' };
    }
    myRegistrations() {
        return { message: 'Requires guest JWT auth (not yet implemented)' };
    }
    updateProfile(_dto) {
        return { message: 'Requires guest JWT auth (not yet implemented)' };
    }
};
exports.GuestsController = GuestsController;
__decorate([
    (0, common_1.Post)('auth/guest/register'),
    (0, swagger_1.ApiOperation)({ summary: 'Guest account registration' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GuestsController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('auth/guest/login'),
    (0, swagger_1.ApiOperation)({ summary: 'Guest login (stub)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GuestsController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('auth/guest/magic-link'),
    (0, swagger_1.ApiOperation)({ summary: 'Request magic link (stub)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GuestsController.prototype, "magicLink", null);
__decorate([
    (0, common_1.Get)('guest/me/registrations'),
    (0, swagger_1.ApiOperation)({ summary: 'My registrations (requires guest JWT — stub)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GuestsController.prototype, "myRegistrations", null);
__decorate([
    (0, common_1.Put)('guest/me/profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update guest profile (stub)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GuestsController.prototype, "updateProfile", null);
exports.GuestsController = GuestsController = __decorate([
    (0, swagger_1.ApiTags)('guests'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [guests_service_1.GuestsService])
], GuestsController);
//# sourceMappingURL=guests.controller.js.map