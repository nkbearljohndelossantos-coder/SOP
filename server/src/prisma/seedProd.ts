import { prisma } from './client';

export const OFFICIAL_DEPARTMENTS = [
  { code: 'ACC', name: 'Accounting', description: 'Financial reporting, budgeting, and invoice audits' },
  { code: 'PUR', name: 'Purchasing', description: 'Vendor procurement, supply acquisition, and PO management' },
  { code: 'MKT', name: 'Marketing & Sales', description: 'Brand management, market expansion, and customer relations' },
  { code: 'REG', name: 'Regulatory', description: 'FDA regulatory compliance, notifications, and licensures' },
  { code: 'RND', name: 'R&D', description: 'Research & product development, formulation, and sample testing' },
  { code: 'HR', name: 'Human Resource', description: 'Talent acquisition, employee welfare, and organizational policies' },
  { code: 'ENG', name: 'Engineering', description: 'Facility engineering, electrical systems, and utilities' },
  { code: 'WH', name: 'Warehouse & Inventory', description: 'Raw materials receiving, inventory control, and storage' },
  { code: 'DISP', name: 'Dispensing', description: 'Accurate raw material weighing and batch dispensing' },
  { code: 'QC', name: 'Quality Control', description: 'In-process analytical testing, inspection, and verification' },
  { code: 'QA', name: 'Quality Assurance', description: 'Quality management systems, audits, and compliance assurance' },
  { code: 'PCK', name: 'Packing', description: 'Secondary packaging, bundling, and boxing operations' },
  { code: 'LOG', name: 'Vehicle / Logistics', description: 'Transportation, dispatch, and distribution logistics' },
  { code: 'FILL', name: 'Filling', description: 'Automated and semi-automated bottle and jar filling lines' },
  { code: 'LBL', name: 'Labeling', description: 'Product container labeling, lot coding, and expiry stamping' },
  { code: 'SHRK', name: 'Shrink Wrap', description: 'Heat tunnel seal and shrink wrap packaging' },
  { code: 'MNT', name: 'Maintenance', description: 'Preventive and corrective maintenance of factory equipment' },
  { code: 'CMP', name: 'Batching & Compounding', description: 'Bulk cosmetic and chemical formulation compounding' },
  { code: 'SCRN', name: 'Silk Screen', description: 'Screen printing on bottles, tubes, and primary containers' },
  { code: 'COAT', name: 'Coating & Production', description: 'Specialized surface coating and production processing' },
  { code: 'IT', name: 'Information Technology', description: 'Infrastructure, systems administration, and data security' },
  { code: 'SEC', name: 'Security', description: 'Plant safety, physical security, and access control' },
];

export async function seedProductionData() {
  console.log('--- Initializing Production Organizational Structure ---');

  for (const dept of OFFICIAL_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {
        name: dept.name,
        description: dept.description,
      },
      create: {
        code: dept.code,
        name: dept.name,
        description: dept.description,
        isActive: true,
      },
    });
  }
  console.log(`✓ Synchronized ${OFFICIAL_DEPARTMENTS.length} official company departments.`);

  // Initialize System Settings
  await prisma.systemSetting.upsert({
    where: { key: 'ORGANIZATION_NAME' },
    update: {},
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

  console.log('✓ Production base initialization complete (0 demo accounts, 0 sample SOPs).');
}

if (require.main === module) {
  seedProductionData()
    .catch((err) => {
      console.error('Production seed failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
