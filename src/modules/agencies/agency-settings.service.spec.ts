import { AgencySettingsService } from './agency-settings.service';

describe('AgencySettingsService', () => {
  let prisma: any;
  let service: AgencySettingsService;

  beforeEach(() => {
    prisma = {
      agency: { findUnique: jest.fn() },
      agencySetting: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new AgencySettingsService(prisma);
  });

  describe('getAllSettings', () => {
    it('returns settings for an existing agency', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      const settings = [
        {
          id: 'setting-1',
          agencyId: 'agency-1',
          key: 'booking_url',
          value: { url: 'https://example.com' },
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];
      prisma.agencySetting.findMany.mockResolvedValue(settings);

      const result = await service.getAllSettings('agency-1');

      expect(prisma.agency.findUnique).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
      });
      expect(prisma.agencySetting.findMany).toHaveBeenCalledWith({
        where: { agencyId: 'agency-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(settings[0]);
    });

    it('throws notFound when the agency does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.getAllSettings('missing-agency')).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.agencySetting.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array when the agency has no settings', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      prisma.agencySetting.findMany.mockResolvedValue([]);

      const result = await service.getAllSettings('agency-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateSetting', () => {
    it('creates a new setting when the key does not exist (upsert)', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      const created = {
        id: 'setting-1',
        agencyId: 'agency-1',
        key: 'booking_url',
        value: { url: 'https://new.example.com' },
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      };
      prisma.agencySetting.upsert.mockResolvedValue(created);

      const result = await service.updateSetting(
        'agency-1',
        'booking_url',
        { url: 'https://new.example.com' },
      );

      expect(prisma.agency.findUnique).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
      });
      expect(prisma.agencySetting.upsert).toHaveBeenCalledWith({
        where: { agencyId_key: { agencyId: 'agency-1', key: 'booking_url' } },
        create: {
          agencyId: 'agency-1',
          key: 'booking_url',
          value: { url: 'https://new.example.com' },
        },
        update: {
          value: { url: 'https://new.example.com' },
          updatedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(created);
    });

    it('throws notFound when the agency does not exist', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSetting('missing-agency', 'booking_url', 'value'),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      expect(prisma.agencySetting.upsert).not.toHaveBeenCalled();
    });

    it('updates an existing setting value', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      const updated = {
        id: 'setting-1',
        agencyId: 'agency-1',
        key: 'booking_url',
        value: 'updated-value',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-03T00:00:00.000Z'),
      };
      prisma.agencySetting.upsert.mockResolvedValue(updated);

      const result = await service.updateSetting('agency-1', 'booking_url', 'updated-value');

      expect(prisma.agencySetting.upsert).toHaveBeenCalledWith({
        where: { agencyId_key: { agencyId: 'agency-1', key: 'booking_url' } },
        create: {
          agencyId: 'agency-1',
          key: 'booking_url',
          value: 'updated-value',
        },
        update: {
          value: 'updated-value',
          updatedAt: expect.any(Date),
        },
      });
      expect(result.value).toBe('updated-value');
    });

    it('works with a null value (JSON null)', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      const updated = {
        id: 'setting-1',
        agencyId: 'agency-1',
        key: 'some_key',
        value: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-03T00:00:00.000Z'),
      };
      prisma.agencySetting.upsert.mockResolvedValue(updated);

      const result = await service.updateSetting('agency-1', 'some_key', null);

      expect(prisma.agencySetting.upsert).toHaveBeenCalledWith({
        where: { agencyId_key: { agencyId: 'agency-1', key: 'some_key' } },
        create: {
          agencyId: 'agency-1',
          key: 'some_key',
          value: null,
        },
        update: {
          value: null,
          updatedAt: expect.any(Date),
        },
      });
      expect(result.value).toBeNull();
    });
  });
});
