import bcrypt from 'bcrypt';
import { PrismaClient, PlatformRole, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || 'superadmin@veakay.com';
  const password = process.argv[3] || 'SuperAdmin123!';
  const displayName = process.argv[4] || 'Super Admin';

  const passwordHash = bcrypt.hashSync(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isActive: true,
      isEmailVerified: true,
      role: UserRole.admin,
      platformRole: PlatformRole.super_admin,
      displayName,
    },
    create: {
      email,
      username: 'superadmin',
      displayName,
      passwordHash,
      isActive: true,
      isEmailVerified: true,
      role: UserRole.admin,
      platformRole: PlatformRole.super_admin,
    },
  });

  await prisma.adminTwoFactor.upsert({
    where: { userId: user.id },
    update: { secret: 'JBSWY3DPEHPK3PXP', isConfirmed: true },
    create: {
      userId: user.id,
      secret: 'JBSWY3DPEHPK3PXP',
      isConfirmed: true,
    },
  });

  console.log(`Super admin seeded: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
