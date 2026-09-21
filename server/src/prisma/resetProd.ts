import { prisma } from './client';

export async function resetToCleanProduction() {
  console.log('===========================================================');
  console.log('  RESETTING TO CLEAN PRODUCTION STATE');
  console.log('===========================================================');

  console.log('Clearing all transactional SOP and workflow data...');
  await prisma.sOPRemark.deleteMany({});
  await prisma.sOPApproval.deleteMany({});
  await prisma.sOPReviewMeeting.deleteMany({});
  await prisma.sOPAttachment.deleteMany({});
  await prisma.sOPParticipant.deleteMany({});
  await prisma.sOPVersion.deleteMany({});
  await prisma.sOP.deleteMany({});

  console.log('Clearing all organizational links and users...');
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.departmentRelationship.deleteMany({});
  await prisma.departmentRepresentative.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Clearing all departments (as requested: tangalin lahat ng Dept)...');
  await prisma.department.deleteMany({});

  console.log('Initializing core system configuration...');
  await prisma.systemSetting.upsert({
    where: { key: 'ORGANIZATION_NAME' },
    update: { value: 'NKB Manufacturing Corp.' },
    create: {
      key: 'ORGANIZATION_NAME',
      value: 'NKB Manufacturing Corp.',
      description: 'Primary corporate entity name',
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'SYSTEM_INITIALIZED' },
    update: { value: 'true' },
    create: {
      key: 'SYSTEM_INITIALIZED',
      value: 'true',
      description: 'System initialization status',
    },
  });

  const deptCount = await prisma.department.count();
  const userCount = await prisma.user.count();
  const sopCount = await prisma.sOP.count();

  console.log('-----------------------------------------------------------');
  console.log(`✓ Departments remaining: ${deptCount}`);
  console.log(`✓ Users remaining:       ${userCount}`);
  console.log(`✓ SOPs remaining:        ${sopCount}`);
  console.log('✓ Production Database is completely clean and ready for onboarding!');
  console.log('  Navigate to /setup to create your initial Super Admin.');
  console.log('===========================================================');
}

if (require.main === module) {
  resetToCleanProduction()
    .catch((err) => {
      console.error('Reset failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
