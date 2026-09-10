import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.contentReport.deleteMany(),
    prisma.verifiedBadge.deleteMany(),
    prisma.adminAuditLog.deleteMany(),
    prisma.adminInvite.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.pushDevice.deleteMany(),
    prisma.milestoneNotificationLog.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.campaignPhoto.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.socialIdentity.deleteMany(),
    prisma.adminTwoFactor.deleteMany(),
    prisma.agencyReview.deleteMany(),
    prisma.agencyDocument.deleteMany(),
    prisma.agencyStaff.deleteMany(),
    prisma.agency.deleteMany(),
    prisma.tripRequest.deleteMany(),
    prisma.smartReplyTemplate.deleteMany(),
    prisma.travelerPreviousTripPhoto.deleteMany(),
    prisma.travelerDestinationPreference.deleteMany(),
    prisma.travelerTravelStylePreference.deleteMany(),
    prisma.travelerProfile.deleteMany(),
    prisma.postLike.deleteMany(),
    prisma.commentLike.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.post.deleteMany(),
    prisma.storyLike.deleteMany(),
    prisma.storyView.deleteMany(),
    prisma.story.deleteMany(),
    prisma.friendRequest.deleteMany(),
    prisma.messageReceipt.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversationParticipant.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.donation.deleteMany(),
    prisma.walletTransaction.deleteMany(),
    prisma.withdrawalRequest.deleteMany(),
    prisma.walletAccount.deleteMany(),
    prisma.fraudFlag.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma as testPrisma };
