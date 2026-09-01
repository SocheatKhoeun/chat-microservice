import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingService } from './setting.service';

describe('SettingService', () => {
  let service: SettingService;
  let findMany: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingService,
        {
          provide: PrismaService,
          useValue: {
            settings: {
              findMany,
            },
          },
        },
      ],
    }).compile();

    service = module.get<SettingService>(SettingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTurnSettings', () => {
    it('parses turn_urls into a trimmed array and falls back to a 3600s TTL when unset', async () => {
      findMany.mockResolvedValue([
        { key: 'turn_secret', value: 'shared-secret' },
        {
          key: 'turn_urls',
          value: ' stun:turn.example.com:3478 , turn:turn.example.com:3478 ',
        },
      ]);

      const result = await service.getTurnSettings();

      expect(result).toEqual({
        secret: 'shared-secret',
        urls: ['stun:turn.example.com:3478', 'turn:turn.example.com:3478'],
        ttlSeconds: 3600,
      });
    });

    it('uses a configured turn_credential_ttl_seconds when present', async () => {
      findMany.mockResolvedValue([
        { key: 'turn_secret', value: 'shared-secret' },
        { key: 'turn_urls', value: 'turn:turn.example.com:3478' },
        { key: 'turn_credential_ttl_seconds', value: '600' },
      ]);

      const result = await service.getTurnSettings();
      expect(result.ttlSeconds).toBe(600);
    });

    it('throws when turn_secret or turn_urls is missing rather than returning a half-configured result', async () => {
      findMany.mockResolvedValue([
        { key: 'turn_secret', value: 'shared-secret' },
      ]);

      await expect(service.getTurnSettings()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
