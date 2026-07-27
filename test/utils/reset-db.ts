import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.otpCode.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.socialIdentity.deleteMany(),
    prisma.adminTwoFactor.deleteMany(),
    prisma.agencyDocument.deleteMany(),
    prisma.agencyStaff.deleteMany(),
    prisma.agency.deleteMany(),
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
    prisma.user.deleteMany(),
  ]);
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma as testPrisma };
