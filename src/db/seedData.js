import { db } from './db.js';

export const DEFAULT_SETTINGS = {
  key: 'business_profile',
  businessName: 'DR FILMS',
  ownerName: 'Deepak Rochwani',
  tagline: 'Creative Studio • Photography • Film Production • Fine Print',
  phone: '+91 98765 43210',
  email: 'contact@drfilms.studio',
  website: 'www.drfilms.studio',
  address: 'Studio 4, Film City Enclave, Mumbai, MH, 400065',
  gstin: '27AABBD1234F1Z8',
  logoUrl: '', // Can be updated with upload
  currencySymbol: '₹',
  currencyCode: 'INR',
  invoicePrefix: 'DRF-',
  nextInvoiceSeq: 1,
  quotePrefix: 'DRF-EST-',
  nextQuoteSeq: 1,
  contractPrefix: 'DRF-AGR-',
  nextContractSeq: 1,
  invoiceTheme: 'cinematic',
  defaultTaxRate: 18, // 18% GST standard in creative services
  taxEnabled: true,
  taxLabel: 'GST',
  defaultPaymentTerms: 'Payment due within 7 days of invoice date. 50% advance required to confirm booking.',
  bankDetails: {
    accountName: 'DR FILMS CREATIVE SERVICES',
    accountNumber: '920020012345678',
    bankName: 'HDFC Bank Ltd',
    ifsc: 'HDFC0001234',
    branch: 'Film City Branch',
    upiId: 'drfilms@hdfcbank'
  },
  whatsappMode: 'auto', // 'auto' | 'web' | 'share_sheet'
  defaultCountryCode: '91',
  whatsappTemplate: `Hello {clientName},

Here is your invoice *{invoiceNumber}* from {businessName}.

Date: {date}
Total Amount: {total}
{paymentLine}Balance Due: {balance}
Due Date: {dueDate}

UPI ID for payment: {upiId}

Thank you,
{businessName}
Phone: {phone}`,
  whatsappPaidTemplate: `Hello {clientName},

Payment received, thank you for working with {businessName}!

Invoice: *{invoiceNumber}*
Date: {date}
Total Amount: {total}
Payment Received: {total}
Status: Paid in Full

Best regards,
{businessName}
Phone: {phone}`,
  sheetsSyncSecret: 'drfilms_backup_secret_2026',
  eventTypes: [
    { id: 'wedding', name: 'Wedding', isHidden: false, sortOrder: 0 },
    { id: 'pre-wedding', name: 'Pre-wedding', isHidden: false, sortOrder: 1 },
    { id: 'engagement', name: 'Engagement', isHidden: false, sortOrder: 2 },
    { id: 'birthday', name: 'Birthday', isHidden: false, sortOrder: 3 },
    { id: 'corporate', name: 'Corporate', isHidden: false, sortOrder: 4 },
    { id: 'baby-maternity', name: 'Baby/Maternity', isHidden: false, sortOrder: 5 },
    { id: 'product-shoot', name: 'Product Shoot', isHidden: false, sortOrder: 6 },
    { id: 'printing-order', name: 'Printing Order', isHidden: false, sortOrder: 7 },
    { id: 'other', name: 'Other', isHidden: false, sortOrder: 8 }
  ],
  defaultDueDays: 7,
  reminderGraceDays: 0,
  reminderTemplates: {
    friendly: `Hello {clientName},

Greetings from {businessName}.

This is a gentle reminder that payment of {amount} is pending for invoice {invoiceNumber} (due {dueDate}).

Pay via UPI: {upiId}

Kindly let us know once the transfer is completed. If you have already made the payment, please disregard this message.

Best regards,
{businessName}`,
    neutral: `Dear {clientName},

This is a reminder regarding pending payment of {amount} for invoice {invoiceNumber}, which was due on {dueDate} ({daysOverdue} days ago).

Pay via UPI: {upiId}

Please settle the account at your earliest convenience. Kindly notify us once the transfer is completed.

Best regards,
{businessName}`,
    firm: `Attention {clientName},

Payment of {amount} for invoice {invoiceNumber} is severely overdue by {daysOverdue} days (due {dueDate}).

Pay via UPI: {upiId}

Kindly clear this outstanding balance immediately to keep your account in good standing. If already paid, please share the transaction reference.

Regards,
{businessName}`
  },
  projectStages: [
    'Booked',
    'Shoot Done',
    'Editing',
    'Client Review',
    'Revision',
    'Ready',
    'Delivered'
  ],
  projectChecklist: [
    'Shoot done',
    'Backup taken',
    'Selection',
    'Editing',
    'Review',
    'Revision',
    'Final export',
    'Delivered'
  ]
};

export const DEFAULT_EVENT_TYPES = [
  'Wedding',
  'Pre-wedding',
  'Engagement',
  'Birthday',
  'Corporate',
  'Baby/Maternity',
  'Product Shoot',
  'Printing Order',
  'Other'
];

export const DEFAULT_CLIENT_TAGS = [
  'Regular',
  'VIP',
  'Corporate',
  'Studio/Partner'
];

export const DEFAULT_REMINDER_SETTINGS = {
  defaultDueDays: 7,
  reminderGraceDays: 0,
  templates: DEFAULT_SETTINGS.reminderTemplates
};

export const DEFAULT_PROJECT_STAGES = DEFAULT_SETTINGS.projectStages;
export const DEFAULT_PROJECT_CHECKLIST = DEFAULT_SETTINGS.projectChecklist;

export const DEFAULT_WHATSAPP_TEMPLATE = DEFAULT_SETTINGS.whatsappTemplate;
export const DEFAULT_WHATSAPP_PAID_TEMPLATE = DEFAULT_SETTINGS.whatsappPaidTemplate;


export const DEFAULT_SERVICES = [
  {
    name: 'Video Editing — Commercial / Promo Reel',
    category: 'video_editing',
    unit: 'per_video',
    rate: 4500,
    description: 'Color grading, cinematic sound design, motion typography, 4K render'
  },
  {
    name: 'Video Editing — YouTube / Long Form',
    category: 'video_editing',
    unit: 'per_hour',
    rate: 1200,
    description: 'Multi-cam synchronization, narrative cut, audio mastering, B-roll injection'
  },
  {
    name: 'Photo Editing & High-End Retouching',
    category: 'photo_editing',
    unit: 'per_photo',
    rate: 150,
    description: 'Frequency separation skin retouch, color grading, high-res export'
  },
  {
    name: 'Photoshoot — Studio / Fashion / Product',
    category: 'photography',
    unit: 'per_hour',
    rate: 2500,
    description: 'Studio strobe lighting setup, tethered shooting, live client review'
  },
  {
    name: 'Photoshoot — Full Day Event & Wedding',
    category: 'photography',
    unit: 'per_day',
    rate: 25000,
    description: 'Full day coverage with dual-card backup, high-end prime lenses'
  },
  {
    name: 'Videography — 4K Cinema Production',
    category: 'videography',
    unit: 'per_day',
    rate: 35000,
    description: 'Cinema camera rig, 3-axis gimbal, wireless lav audio, professional lighting'
  },
  {
    name: 'Videography — Half Day Interview / Event',
    category: 'videography',
    unit: 'per_hour',
    rate: 3500,
    description: 'Interviews, corporate documentary, gimbal b-roll capture'
  },
  {
    name: 'Fine Art Photo Print (12x18 inch)',
    category: 'printing',
    unit: 'per_photo',
    rate: 650,
    description: 'Archival luster photographic paper, calibrated color-accurate ink'
  },
  {
    name: 'Photobook / Album Print & Binding',
    category: 'printing',
    unit: 'per_page',
    rate: 120,
    description: 'Layflat flush-mount velvet matte finish pages with hardbound leatherette'
  },
  {
    name: 'Merchandise / Poster Printing',
    category: 'printing',
    unit: 'per_piece',
    rate: 180,
    description: 'Heavyweight matte cardstock with anti-scratch lamination'
  }
];

export const DEFAULT_CHARGES = [
  {
    name: 'Rush Delivery Fee (24-Hour Turnaround)',
    type: 'percentage',
    rate: 25,
    nature: 'charge',
    description: 'Priority overnight queue jump and accelerated delivery'
  },
  {
    name: 'Travel & Location Conveyance',
    type: 'fixed',
    rate: 1500,
    nature: 'charge',
    description: 'Local transit, equipment logistics and conveyance'
  },
  {
    name: 'Extra Revision Round (Beyond 2 Free)',
    type: 'fixed',
    rate: 1000,
    nature: 'charge',
    description: 'Post-approval editorial review and render'
  },
  {
    name: 'Drone / Aerial Cinematography Kit',
    type: 'fixed',
    rate: 7000,
    nature: 'charge',
    description: 'Licensed pilot, 4K HDR drone footage capture'
  },
  {
    name: 'Express Courier & Safe Album Packaging',
    type: 'fixed',
    rate: 450,
    nature: 'charge',
    description: 'Waterproof insulated bubble packaging with tracked delivery'
  },
  {
    name: 'Special Client Loyalty Discount',
    type: 'percentage',
    rate: 10,
    nature: 'discount',
    description: 'Preferred long-term client privilege discount'
  }
];

export const DEFAULT_EQUIPMENT = [
  { name: 'Sony FX3 Cinema Line (Body A)', category: 'Camera', serialNumber: 'FX3-001', status: 'available' },
  { name: 'Sony FX6 Full-Frame Cinema (Body B)', category: 'Camera', serialNumber: 'FX6-002', status: 'available' },
  { name: 'Sony Alpha 7 IV (Stills & Backup)', category: 'Camera', serialNumber: 'A74-003', status: 'available' },
  { name: 'Sony FE 24-70mm f/2.8 GM II', category: 'Lens', serialNumber: 'LNS-2470', status: 'available' },
  { name: 'Sony FE 70-200mm f/2.8 GM OSS II', category: 'Lens', serialNumber: 'LNS-70200', status: 'available' },
  { name: 'DJI RS 3 Pro Gimbal Stabilizer', category: 'Gimbal', serialNumber: 'GMB-RS3', status: 'available' },
  { name: 'DJI Mavic 3 Cine Combo', category: 'Drone', serialNumber: 'DRN-MVC3', status: 'available' },
  { name: 'Aputure 300d II Light Kit', category: 'Lighting', serialNumber: 'LGT-300D', status: 'available' },
  { name: 'Rode Wireless PRO Dual Mic Set', category: 'Audio', serialNumber: 'AUD-RODE', status: 'available' }
];

export const DEFAULT_CREW = [
  { name: 'Rahul Sharma', role: 'Lead Cinematographer', phone: '+91 98250 11223', email: 'rahul@drfilms.studio', dailyRate: 8000 },
  { name: 'Kunal Patel', role: 'Candid Photographer', phone: '+91 98250 44556', email: 'kunal@drfilms.studio', dailyRate: 6000 },
  { name: 'Amit Yadav', role: 'Drone Pilot & Aerial Operator', phone: '+91 98250 77889', email: 'amit@drfilms.studio', dailyRate: 7000 },
  { name: 'Rohit Verma', role: 'Gimbal Operator / Focus Puller', phone: '+91 98250 99001', email: 'rohit@drfilms.studio', dailyRate: 4500 },
  { name: 'Priya Desai', role: 'Senior Video Editor / Colorist', phone: '+91 98250 33445', email: 'priya@drfilms.studio', dailyRate: 5000 }
];

export const DEFAULT_CUSTOMERS = [];

export const DEFAULT_USERS = [];

export const DEFAULT_DEPLOYMENT_CONFIG = {
  key: 'admin_deployment_config',
  liveWebsiteUrl: 'https://billing.drfilms.studio',
  maintenanceMode: false,
  maintenanceMessage: 'DR FILMS Billing System is undergoing scheduled system updates. Please contact the studio for urgent inquiries.',
  allowClientRegistration: false,
  requirePinOnEveryAction: false,
  sessionTimeoutMinutes: 30,
  organizationName: 'DR FILMS Creative Studios',
  deployedEnvironment: 'production',
  sslActive: true,
  offlinePwaEnabled: true
};

export const DEFAULT_SUBSCRIPTION_CONFIG = {
  key: 'admin_subscription_config',
  clientStudioName: '',
  contactPhone: '',
  contactEmail: '',
  supportWhatsapp: '919876543210',
  planTier: 'trial',
  status: 'trial',
  trialStartDate: new Date().toISOString().split('T')[0],
  trialDurationDays: 14,
  trialMaxBills: 25,
  trialMaxClients: 15,
  gracePeriodDays: 3,
  licenseKey: '',
  notes: '14-Day Free Studio Trial'
};


export const DEFAULT_FEATURE_FLAGS = {
  key: 'admin_feature_flags',
  enableQuotes: true,             // Estimates & Quotations
  enableProjects: true,           // Projects & Crew Tracker
  enableExpenses: true,           // Expenses & Net Profit
  enableReports: true,            // Accountant Reports
  enableHourCalculator: true,     // Hour / Shift Calculator
  enableWeddingSuite: true,       // Wedding Studio Mode (Rate-only, flexible dates)
  enableContracts: true,          // Legal Agreement Contracts
  enableReceipts: true,           // Official Payment Receipts
  enableWhatsApp: true,           // WhatsApp Invoicing & Reminders
  enableGoogleSheets: true,       // Google Sheets Cloud Sync
  enableDirectClient: true,       // Direct Client Quick Billing
  enableThemeSwitcher: true       // Invoice Themes Selection
};

export async function initDatabase() {
  try {
    // 1. Check Settings
    const existingSettings = await db.settings.get('business_profile');
    if (!existingSettings) {
      await db.settings.put(DEFAULT_SETTINGS);
    } else {
      const updates = {};
      if (!existingSettings.eventTypes || existingSettings.eventTypes.length === 0) {
        updates.eventTypes = DEFAULT_SETTINGS.eventTypes;
      }
      if (existingSettings.defaultDueDays === undefined) {
        updates.defaultDueDays = DEFAULT_SETTINGS.defaultDueDays;
      }
      if (existingSettings.reminderGraceDays === undefined) {
        updates.reminderGraceDays = DEFAULT_SETTINGS.reminderGraceDays;
      }
      if (!existingSettings.reminderTemplates) {
        updates.reminderTemplates = DEFAULT_SETTINGS.reminderTemplates;
      } else {
        const t = existingSettings.reminderTemplates;
        if (
          (t.friendly && t.friendly.includes('₹{amount}')) ||
          (t.neutral && t.neutral.includes('₹{amount}')) ||
          (t.firm && t.firm.includes('₹{amount}'))
        ) {
          updates.reminderTemplates = DEFAULT_SETTINGS.reminderTemplates;
        }
      }
      if (!existingSettings.projectStages) {
        updates.projectStages = DEFAULT_SETTINGS.projectStages;
      }
      if (!existingSettings.projectChecklist) {
        updates.projectChecklist = DEFAULT_SETTINGS.projectChecklist;
      }
      if (!existingSettings.invoiceTheme) {
        updates.invoiceTheme = DEFAULT_SETTINGS.invoiceTheme || 'cinematic';
      }
      if (!existingSettings.quotePrefix) {
        updates.quotePrefix = DEFAULT_SETTINGS.quotePrefix || 'DRF-EST-';
      }
      if (!existingSettings.contractPrefix) {
        updates.contractPrefix = DEFAULT_SETTINGS.contractPrefix || 'DRF-AGR-';
      }
      if (existingSettings.ownerName === undefined) {
        updates.ownerName = existingSettings.bankDetails?.accountName || DEFAULT_SETTINGS.ownerName || '';
      }
      if (Object.keys(updates).length > 0) {
        await db.settings.update('business_profile', updates);
      }
    }

    // 2. Check Services
    const servicesCount = await db.services.count();
    if (servicesCount === 0) {
      await db.services.bulkAdd(
        DEFAULT_SERVICES.map(s => ({ ...s, createdAt: new Date().toISOString() }))
      );
    }

    // 3. Check Custom Charges
    const chargesCount = await db.customCharges.count();
    if (chargesCount === 0) {
      await db.customCharges.bulkAdd(DEFAULT_CHARGES);
    }

    // 4. Check Equipment
    try {
      if (db.equipment) {
        const equipCount = await db.equipment.count();
        if (equipCount === 0) {
          await db.equipment.bulkAdd(
            DEFAULT_EQUIPMENT.map(e => ({ ...e, isDeleted: false, createdAt: new Date().toISOString() }))
          );
        }
      }
    } catch (eEquip) {
      console.warn('Equipment seed error:', eEquip);
    }

    // 5. Check Crew
    try {
      if (db.crew) {
        const crewCount = await db.crew.count();
        if (crewCount === 0) {
          await db.crew.bulkAdd(
            DEFAULT_CREW.map(c => ({ ...c, isDeleted: false, createdAt: new Date().toISOString() }))
          );
        }
      }
    } catch (eCrew) {
      console.warn('Crew seed error:', eCrew);
    }

    // 6. Check Users for Admin Panel
    try {
      if (db.users) {
        const userCount = await db.users.count();
        if (userCount === 0) {
          await db.users.bulkAdd(DEFAULT_USERS);
        }
      }
    } catch (eUsers) {
      console.warn('Users seed error:', eUsers);
    }

    // 7. Check Admin Deployment Config for Live Website
    try {
      const existingDeployConfig = await db.settings.get('admin_deployment_config');
      if (!existingDeployConfig) {
        await db.settings.put(DEFAULT_DEPLOYMENT_CONFIG);
      }
    } catch (eDeploy) {
      console.warn('Deploy config seed error:', eDeploy);
    }

    // 8. Check Subscription & Licensing Config
    try {
      const existingSub = await db.settings.get('admin_subscription_config');
      if (!existingSub) {
        await db.settings.put(DEFAULT_SUBSCRIPTION_CONFIG);
      }
    } catch (eSub) {
      console.warn('Subscription config seed error:', eSub);
    }


    // 9. Check Admin Feature Flags
    try {
      const existingFlags = await db.settings.get('admin_feature_flags');
      if (!existingFlags) {
        await db.settings.put(DEFAULT_FEATURE_FLAGS);
      }
    } catch (eFlags) {
      console.warn('Feature flags seed error:', eFlags);
    }

    // Run repair for any corrupted line item descriptions or totals (restoring DRF-0001)
    try {
      const { repairCorruptedBills } = await import('../utils/catalogSync.js');
      await repairCorruptedBills();
    } catch (eRepair) {
      console.warn('repairCorruptedBills warning:', eRepair);
    }
  } catch (error) {
    console.error('Failed to initialize database seeds:', error);
  }
}
