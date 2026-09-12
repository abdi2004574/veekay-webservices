import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { FriendRequestStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/services/notifications.service';

const USER_SELECT = {
  select: {
    id: true,
    username: true,
    displayName: true,
    travelerProfile: { select: { photoMediaId: true } },
  },
};

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getFriendIds(userId: string): Promise<string[]> {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        status: FriendRequestStatus.accepted,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    });
    return requests.map((r) =>
      r.requesterId === userId ? r.addresseeId : r.requesterId,
    );
  }

  async areFriends(userIdA: string, userIdB: string): Promise<boolean> {
    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.accepted,
        OR: [
          { requesterId: userIdA, addresseeId: userIdB },
          { requesterId: userIdB, addresseeId: userIdA },
        ],
      },
    });
    return !!existing;
  }

  async getConnectionStatus(viewerId: string, otherId: string) {
    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: viewerId },
        ],
      },
    });

    if (!existing) {
      return { isFriend: false, requestSent: false, requestReceived: false };
    }
    if (existing.status === FriendRequestStatus.accepted) {
      return { isFriend: true, requestSent: false, requestReceived: false };
    }
    if (existing.status === FriendRequestStatus.pending) {
      return {
        isFriend: false,
        requestSent: existing.requesterId === viewerId,
        requestReceived: existing.requesterId === otherId,
      };
    }
    return { isFriend: false, requestSent: false, requestReceived: false };
  }

  async getMutualFriendsCount(
    userIdA: string,
    userIdB: string,
  ): Promise<number> {
    const [friendsA, friendsB] = await Promise.all([
      this.getFriendIds(userIdA),
      this.getFriendIds(userIdB),
    ]);
    const setB = new Set(friendsB);
    return friendsA.filter((id) => setB.has(id)).length;
  }

  async sendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) {
      throw AppException.badRequest(
        'You cannot send a friend request to yourself.',
      );
    }

    const addressee = await this.prisma.user.findUnique({
      where: { id: addresseeId },
    });
    if (!addressee) {
      throw AppException.notFound('User not found.');
    }

    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
        status: {
          in: [FriendRequestStatus.pending, FriendRequestStatus.accepted],
        },
      },
    });
    if (existing) {
      throw AppException.conflict(
        existing.status === FriendRequestStatus.accepted
          ? 'You are already friends with this user.'
          : 'A friend request already exists between you and this user.',
      );
    }

    const request = await this.prisma.friendRequest.create({
      data: { requesterId, addresseeId },
    });

    try {
      await this.notificationsService.create(addresseeId, {
        type: NotificationType.friend_request,
        title: 'New Friend Request',
        body: 'Someone sent you a friend request.',
        deepLinkTarget: 'friend_request',
        deepLinkEntityId: request.id,
      });
    } catch (error) {
      // Log error but don't fail the friend request
    }

    return request;
  }

  private async findPendingRequestForAddressee(
    requestId: string,
    userId: string,
  ) {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.addresseeId !== userId) {
      throw AppException.notFound('Friend request not found.');
    }
    if (request.status !== FriendRequestStatus.pending) {
      throw AppException.businessRule(
        'This friend request has already been responded to.',
      );
    }
    return request;
  }

  async accept(requestId: string, userId: string) {
    await this.findPendingRequestForAddressee(requestId, userId);
    return this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.accepted, respondedAt: new Date() },
    });
  }

  async decline(requestId: string, userId: string) {
    await this.findPendingRequestForAddressee(requestId, userId);
    return this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.declined, respondedAt: new Date() },
    });
  }

  async listIncoming(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { addresseeId: userId, status: FriendRequestStatus.pending },
      orderBy: { createdAt: 'desc' },
      include: { requester: USER_SELECT },
    });
  }

  async listFriends(userId: string) {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        status: FriendRequestStatus.accepted,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      orderBy: { respondedAt: 'desc' },
      include: { requester: USER_SELECT, addressee: USER_SELECT },
    });

    return requests.map((r) =>
      r.requesterId === userId ? r.addressee : r.requester,
    );
  }

  async unfriend(userId: string, otherUserId: string) {
    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.accepted,
        OR: [
          { requesterId: userId, addresseeId: otherUserId },
          { requesterId: otherUserId, addresseeId: userId },
        ],
      },
    });
    if (!existing) {
      throw AppException.notFound('You are not friends with this user.');
    }
    await this.prisma.friendRequest.delete({ where: { id: existing.id } });
  }
}
