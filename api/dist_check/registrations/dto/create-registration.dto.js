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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateRegistrationDto = exports.ConsentsDto = exports.OptionsDto = exports.ParticipantInputDto = exports.ContactDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class ContactDto {
}
exports.ContactDto = ContactDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ContactDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ContactDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsEmail)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ContactDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ContactDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ContactDto.prototype, "address", void 0);
class ParticipantInputDto {
}
exports.ParticipantInputDto = ParticipantInputDto;
__decorate([
    (0, class_validator_1.IsIn)(['adult', 'child']),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ParticipantInputDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ParticipantInputDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantInputDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(120),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ParticipantInputDto.prototype, "age", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['F', 'M', 'other']),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ParticipantInputDto.prototype, "gender", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantInputDto.prototype, "dietary", void 0);
class OptionsDto {
}
exports.OptionsDto = OptionsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], OptionsDto.prototype, "transport", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], OptionsDto.prototype, "bedding", void 0);
class ConsentsDto {
}
exports.ConsentsDto = ConsentsDto;
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConsentsDto.prototype, "rodo", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConsentsDto.prototype, "regulamin", void 0);
class CreateRegistrationDto {
}
exports.CreateRegistrationDto = CreateRegistrationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateRegistrationDto.prototype, "instanceId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['pl', 'en', 'it']),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateRegistrationDto.prototype, "locale", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ContactDto),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", ContactDto)
], CreateRegistrationDto.prototype, "contact", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ParticipantInputDto),
    (0, swagger_1.ApiProperty)({ type: [ParticipantInputDto] }),
    __metadata("design:type", Array)
], CreateRegistrationDto.prototype, "participants", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateRegistrationDto.prototype, "preferredRoomId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRegistrationDto.prototype, "dietaryNotes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => OptionsDto),
    __metadata("design:type", OptionsDto)
], CreateRegistrationDto.prototype, "options", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRegistrationDto.prototype, "discountCode", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['ONLINE', 'BANK_TRANSFER']),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateRegistrationDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ConsentsDto),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", ConsentsDto)
], CreateRegistrationDto.prototype, "consents", void 0);
//# sourceMappingURL=create-registration.dto.js.map