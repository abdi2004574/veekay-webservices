import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { CreateWithdrawalRequestDto } from './dto/create-withdrawal-request.dto';
import { WalletTransactionFilterDto } from './dto/wallet-transaction-filter.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('me/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @RequireRole(UserRole.traveler, UserRole.agency)
  @ApiOperation({ summary: '[Traveler/Agency] Get my own wallet account.' })
  async getMyWallet(@CurrentUser('userId') userId: string) {
    return this.walletService.getMyWallet(userId);
  }

  @Get('transactions')
  @RequireRole(UserRole.traveler, UserRole.agency)
  @ApiOperation({
    summary: '[Traveler/Agency] List my own wallet transactions, newest first.',
  })
  async listTransactions(
    @Query() filter: WalletTransactionFilterDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.walletService.listTransactions(userId, filter);
  }

  @Get('withdrawals')
  @RequireRole(UserRole.traveler, UserRole.agency)
  @ApiOperation({ summary: '[Traveler/Agency] List my own withdrawal requests.' })
  async listMyWithdrawals(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.walletService.listMyWithdrawals(
      userId,
      cursor,
      limit ? Number(limit) : 20,
    );
  }

  @Post('withdrawals')
  @HttpCode(HttpStatus.CREATED)
  @RequireRole(UserRole.traveler, UserRole.agency)
  @UseGuards(IdempotencyKeyGuard)
  @ApiOperation({
    summary: '[Traveler/Agency] Request a withdrawal from my wallet balance.',
  })
  async createWithdrawal(
    @Body() dto: CreateWithdrawalRequestDto,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.walletService.requestWithdrawal(userId, dto, idempotencyKey);
  }

  @Get('withdrawals/:id')
  @RequireRole(UserRole.traveler, UserRole.agency)
  @ApiOperation({ summary: '[Traveler/Agency] Get one of my withdrawal requests.' })
  async getWithdrawalDetail(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.walletService.getWithdrawalDetail(id, userId, role);
  }
}