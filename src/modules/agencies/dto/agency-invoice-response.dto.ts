import { ApiProperty } from '@nestjs/swagger';

export class AgencyInvoiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() agencyId!: string;
  @ApiProperty({ required: false }) tripRequestId?: string;
  @ApiProperty() amount!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() commissionAmount!: number;
  @ApiProperty() netAmount!: number;
  @ApiProperty() status!: string;
  @ApiProperty() dueDate!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ required: false }) updatedAt?: string;
}
