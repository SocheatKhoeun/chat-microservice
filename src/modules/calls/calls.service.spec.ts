import { createHmac } from 'node:crypto';
import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { ChatEventsService } from '../../common/services/chat-events/chat-events.service';
import { ConversationsService } from '../conversations/conversations.service';
import { CallsService } from './calls.service';

describe('CallsService.getTurnCredentials', () => {
  let service: CallsService;
  let settingService: { getTurnSettings: jest.Mock };

  beforeEach(async () => {
    settingService = { getTurnSettings: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallsService,
        { provide: PrismaService, useValue: {} },
        { provide: ConversationsService, useValue: {} },
        { provide: ChatEventsService, useValue: {} },
        { provide: SettingService, useValue: settingService },
      ],
    }).compile();

    service = module.get<CallsService>(CallsService);
  });

  it('returns stun: entries without credentials and turn:/turns: entries with a matching HMAC credential', async () => {
    settingService.getTurnSettings.mockResolvedValue({
      secret: 'shared-secret',
      urls: [
        'stun:turn.example.com:3478',
        'turn:turn.example.com:3478',
        'turns:turn.example.com:5349',
      ],
      ttlSeconds: 3600,
    });

    const before = Math.floor(Date.now() / 1000);
    const result = await service.getTurnCredentials('user_1');
    const after = Math.floor(Date.now() / 1000);

    expect(result.iceServers).toHaveLength(3);

    const stunEntry = result.iceServers[0];
    expect(stunEntry.urls).toBe('stun:turn.example.com:3478');
    expect(stunEntry.username).toBeUndefined();
    expect(stunEntry.credential).toBeUndefined();

    for (const turnEntry of [result.iceServers[1], result.iceServers[2]]) {
      expect(turnEntry.username).toBeDefined();
      expect(turnEntry.credential).toBeDefined();

      const [expiryStr, embeddedUserId] = (turnEntry.username as string).split(
        ':',
      );
      expect(embeddedUserId).toBe('user_1');

      const expiry = Number(expiryStr);
      // Expiry embedded in the username is "now + ttlSeconds", within the
      // window the test itself ran in.
      expect(expiry).toBeGreaterThanOrEqual(before + 3600);
      expect(expiry).toBeLessThanOrEqual(after + 3600);

      // The credential must be exactly what a TURN server configured with
      // the same shared secret would independently derive — verified by
      // recomputing it here rather than trusting the service's own math.
      const expectedCredential = createHmac('sha1', 'shared-secret')
        .update(turnEntry.username as string)
        .digest('base64');
      expect(turnEntry.credential).toBe(expectedCredential);
    }
  });

  it('gives every turn:/turns: entry the same username/credential pair for one request (one coherent credential set, not per-server)', async () => {
    settingService.getTurnSettings.mockResolvedValue({
      secret: 'shared-secret',
      urls: ['turn:a.example.com:3478', 'turn:b.example.com:3478'],
      ttlSeconds: 3600,
    });

    const result = await service.getTurnCredentials('user_1');
    expect(result.iceServers[0].username).toBe(result.iceServers[1].username);
    expect(result.iceServers[0].credential).toBe(
      result.iceServers[1].credential,
    );
  });

  it('propagates a clear error when no TURN server is configured for this deployment', async () => {
    settingService.getTurnSettings.mockRejectedValue(
      new InternalServerErrorException('No TURN server configured!'),
    );

    await expect(service.getTurnCredentials('user_1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
