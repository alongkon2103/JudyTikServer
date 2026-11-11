import {AppPresenceController,AppPresenceCountController} from './app-presence/controller.js'
import {AppPresenceService} from './app-presence/service.js'
import {LivePresenceController,LiveDirectoryController} from './live-presence/controller.js'
import {LivePresenceService} from './live-presence/service.js'
import { HistoryController } from './history/controller.js'
import { HistoryService } from './history/service.js'
import {GamesService} from './games/service.js'
import {GameFilesController} from './games/files.controller.js'
import {GamesController,GameCategoriesController,AdminGameCategoriesController,AdminGamesController} from './games/controller.js'
import {
  Module,
  Controller,
  Get,
  Inject,
  type DynamicModule,
} from '@nestjs/common'
import { CONFIG, type ServerConfig } from './config/env.js'
import { PrismaService } from './database/prisma.service.js'
import { EulerGiftClient } from './gifts/euler.client.js'
import { GiftsService } from './gifts/gifts.service.js'
import {
  GiftsController,
  AdminGiftsController,
} from './gifts/gifts.controller.js'
import { AdminGuard } from './http/admin.guard.js'
import { AuthController } from './auth/auth.controller.js'
import { AuthService } from './auth/auth.service.js'
import { AuthSecurity } from './auth/security.js'
import { OAuthProviders } from './auth/provider-adapters.js'
import { SessionGuard } from './auth/session.guard.js'
import { CLOCK, systemClock, type Clock } from './auth/clock.js'
import { AccountsController } from './accounts/accounts.controller.js'
import { AccountsService } from './accounts/accounts.service.js'
import {AdminUsersController} from './accounts/admin.controller.js'
import {AdminUsersService} from './accounts/admin.service.js'
import {AccountMergeService} from './accounts/merge.service.js'
import { EmailService } from './accounts/email.service.js'
import { VerificationMailer } from './accounts/mailer.js'
import { EntitlementsService } from './entitlements/entitlements.service.js'
import {EntitlementsAdminService} from './entitlements/admin.service.js'
import {EntitlementsAdminController} from './entitlements/admin.controller.js'
import {PresetsService} from './presets/service.js'
import {PresetsController} from './presets/controller.js'
import {SettingsService} from './settings/service.js'
import {SettingsController} from './settings/controller.js'
import {WinController} from './win/controller.js'
import {WinService} from './win/service.js'
import { SoundpadController } from './soundpad/controller.js'
import { SoundpadService } from './soundpad/service.js'
import { TtsController } from './tts/controller.js'
import { TtsService } from './tts/service.js'
import { OverlaysController } from './overlays/controller.js'
import { OverlaysService } from './overlays/service.js'
import { LiveController } from './live/controller.js'
import { LiveService } from './live/service.js'
@Controller('health')
class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  @Get() live() {
    return { status: 'ok' }
  }
  @Get('ready') async ready() {
    await this.db.client.$queryRaw`SELECT 1`
    return { status: 'ok' }
  }
}
@Module({})
export class AppModule {
  static register(
    config: ServerConfig,
    euler: EulerGiftClient = new EulerGiftClient(),
  ): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        AdminUsersController,
        EntitlementsAdminController,
        HealthController, AppPresenceController, AppPresenceCountController, HistoryController, LivePresenceController, LiveDirectoryController,
        GamesController, GameCategoriesController, AdminGameCategoriesController, AdminGamesController, GameFilesController,
        GiftsController,
        AdminGiftsController,
        AuthController,
        AccountsController,
        PresetsController, SettingsController, LiveController, WinController, SoundpadController, TtsController, OverlaysController,
      ],
      providers: [
        AdminUsersService,
        EntitlementsAdminService,
        { provide: CONFIG, useValue: config },
        PrismaService,
        { provide: EulerGiftClient, useValue: euler },
        AppPresenceService, GiftsService, GamesService, HistoryService, LivePresenceService,
        AdminGuard,
        { provide: CLOCK, useValue: systemClock },
        {
          provide: AuthSecurity,
          useFactory: (clock: Clock) => new AuthSecurity(config.auth, clock),
          inject: [CLOCK],
        },
        {
          provide: OAuthProviders,
          useFactory: () => new OAuthProviders(config.auth),
        },
        {
          provide: VerificationMailer,
          useFactory: () => new VerificationMailer(config.auth),
        },
        AuthService,
        SessionGuard,
        AccountsService,
        AccountMergeService,
        EmailService,
        EntitlementsService,
        PresetsService, SettingsService, LiveService, WinService, SoundpadService, TtsService, OverlaysService,
      ],
    }
  }
}
