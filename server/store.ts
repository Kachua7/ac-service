import type {
  AdminOverviewStats,
  AuditLogEntry,
  Booking,
  BookingComplaint,
  BookingStatus,
  Coupon,
  ServiceArea,
  ServicePackage,
  SlotAvailability,
  Technician,
} from '../shared/types';
import { generateRouteWaypoints, haversineDistanceKm } from './dispatch';
import { calculatePriceSnapshot } from './pricing';
import { createSnapshotBackend, SNAPSHOT_BACKEND_HINT, type SnapshotBackend } from './persistence';

export interface DatabaseState {
  serviceAreas: ServiceArea[];
  services: ServicePackage[];
  coupons: Coupon[];
  technicians: Technician[];
  bookings: Booking[];
  complaints: BookingComplaint[];
  auditLogs: AuditLogEntry[];
}

export const TIME_SLOTS = [
  { slotId: 'slot-09', label: '09:00 AM – 10:30 AM', startHour: 9 },
  { slotId: 'slot-11', label: '11:00 AM – 12:30 PM', startHour: 11 },
  { slotId: 'slot-14', label: '02:00 PM – 03:30 PM', startHour: 14 },
  { slotId: 'slot-16', label: '04:00 PM – 05:30 PM', startHour: 16 },
  { slotId: 'slot-18', label: '06:00 PM – 07:30 PM', startHour: 18 },
];

export const VALID_STATE_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'ASSIGNMENT_PENDING', 'ASSIGNED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNMENT_PENDING', 'ASSIGNED', 'CANCELLED'],
  ASSIGNMENT_PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['TECHNICIAN_EN_ROUTE', 'ASSIGNMENT_PENDING', 'CANCELLED'],
  TECHNICIAN_EN_ROUTE: ['TECHNICIAN_ARRIVED', 'CANCELLED'],
  TECHNICIAN_ARRIVED: ['INSPECTION_IN_PROGRESS', 'SERVICE_IN_PROGRESS', 'CANCELLED'],
  INSPECTION_IN_PROGRESS: ['QUOTE_PENDING', 'SERVICE_IN_PROGRESS', 'COMPLETED'],
  QUOTE_PENDING: ['QUOTE_APPROVED', 'SERVICE_IN_PROGRESS', 'CANCELLED'],
  QUOTE_APPROVED: ['SERVICE_IN_PROGRESS', 'COMPLETED'],
  SERVICE_IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

function createSeedState(): DatabaseState {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const serviceAreas: ServiceArea[] = [
    {
      id: 'area-jpr-vaishali',
      city: 'Jaipur',
      state: 'Rajasthan',
      locality: 'Vaishali Nagar',
      pinCode: '302021',
      active: true,
      center: { lat: 26.9124, lng: 75.7439 },
      estimatedArrivalMins: 28,
    },
    {
      id: 'area-jpr-malviya',
      city: 'Jaipur',
      state: 'Rajasthan',
      locality: 'Malviya Nagar',
      pinCode: '302017',
      active: true,
      center: { lat: 26.8549, lng: 75.8243 },
      estimatedArrivalMins: 25,
    },
    {
      id: 'area-jpr-mansarovar',
      city: 'Jaipur',
      state: 'Rajasthan',
      locality: 'Mansarovar',
      pinCode: '302020',
      active: true,
      center: { lat: 26.8682, lng: 75.7689 },
      estimatedArrivalMins: 32,
    },
    {
      id: 'area-jpr-cscheme',
      city: 'Jaipur',
      state: 'Rajasthan',
      locality: 'C-Scheme & Civil Lines',
      pinCode: '302001',
      active: true,
      center: { lat: 26.9068, lng: 75.7985 },
      estimatedArrivalMins: 22,
    },
    {
      id: 'area-jpr-rajapark',
      city: 'Jaipur',
      state: 'Rajasthan',
      locality: 'Raja Park & Adarsh Nagar',
      pinCode: '302004',
      active: true,
      center: { lat: 26.8965, lng: 75.8305 },
      estimatedArrivalMins: 26,
    },
    {
      id: 'area-jpr-vidyadhar',
      city: 'Jaipur',
      state: 'Rajasthan',
      locality: 'Vidyadhar Nagar',
      pinCode: '302039',
      active: true,
      center: { lat: 26.9609, lng: 75.7811 },
      estimatedArrivalMins: 35,
    },
    {
      id: 'area-jpr-jagatpura',
      city: 'Jaipur',
      state: 'Rajasthan',
      locality: 'Jagatpura',
      pinCode: '302017',
      active: true,
      center: { lat: 26.8342, lng: 75.8621 },
      estimatedArrivalMins: 36,
    },
    {
      id: 'area-jdp-sardarpura',
      city: 'Jodhpur',
      state: 'Rajasthan',
      locality: 'Sardarpura (Pilot)',
      pinCode: '342003',
      active: false,
      center: { lat: 26.2775, lng: 73.0086 },
      estimatedArrivalMins: 40,
    },
    {
      id: 'area-udr-fatehpura',
      city: 'Udaipur',
      state: 'Rajasthan',
      locality: 'Fatehpura (Upcoming)',
      pinCode: '313001',
      active: false,
      center: { lat: 24.5978, lng: 73.6869 },
      estimatedArrivalMins: 45,
    },
  ];

  const services: ServicePackage[] = [
    {
      id: 'svc-foam-jet',
      slug: 'foam-jet-ac-servicing',
      name: 'Foam-Jet Deep AC Servicing',
      category: 'SERVICING',
      shortDescription:
        'High-pressure jet coil wash, foam detergent treatment, drain line flush, and airflow calibration.',
      detailedDescription:
        'Designed for Rajasthan dust and peak summer heat. Removes embedded desert silt from indoor evaporator fins and outdoor condenser coils using a protective waterproof service jacket.',
      basePriceInr: 599,
      additionalUnitDiscountPct: 12,
      estimatedDurationMins: 60,
      warrantyDays: 30,
      applicableAcTypes: ['SPLIT', 'WINDOW', 'CASSETTE'],
      inclusions: [
        'Waterproof AC jacket protection for walls & furniture',
        'Active foam + high-pressure jet wash of cooling coils',
        'Outdoor condenser unit pressure cleaning',
        'Drain pipe vacuum & anti-fungal flush',
        'Pre & post airflow temperature differential check',
      ],
      exclusions: [
        'Refrigerant gas top-up or leak brazing',
        'Spare electrical parts (capacitors, PCB, fan motor)',
        'High-rise scaffolding beyond standard balcony access',
      ],
      preparationTips: [
        'Keep a bucket and standard power socket accessible near the indoor unit.',
        'Clear small fragile items directly underneath the AC.',
      ],
      active: true,
      priceVersion: 3,
    },
    {
      id: 'svc-general',
      slug: 'ac-general-servicing',
      name: 'Standard AC Preventive Checkup',
      category: 'SERVICING',
      shortDescription:
        'Filter wash, blower brush cleaning, drain check, and electrical terminal inspection.',
      detailedDescription:
        'Quick preventive service for units serviced within the last 4 months that need dust filter clearing and performance verification.',
      basePriceInr: 399,
      additionalUnitDiscountPct: 10,
      estimatedDurationMins: 45,
      warrantyDays: 15,
      applicableAcTypes: ['SPLIT', 'WINDOW'],
      inclusions: [
        'Dust filter & louver deep wash',
        'Blower wheel dry brush & vacuum',
        'Ampere draw & thermostat sensor check',
        'Drain tray clearing',
      ],
      exclusions: [
        'High-pressure jet pump washing',
        'Gas charging or spare parts',
      ],
      preparationTips: [
        'Keep the AC remote handy for mode testing.',
      ],
      active: true,
      priceVersion: 2,
    },
    {
      id: 'svc-repair',
      slug: 'ac-repair-diagnostics',
      name: 'AC Repair & Cooling Diagnostics',
      category: 'REPAIR',
      shortDescription:
        'Root-cause inspection for no cooling, water leakage, PCB fault, or tripping breakers.',
      detailedDescription:
        'Certified technician inspects compressor amperage, capacitor health, PCB error codes, and refrigerant pressure. Any repair part requires your explicit digital quote approval before work starts.',
      basePriceInr: 299,
      additionalUnitDiscountPct: 15,
      estimatedDurationMins: 45,
      warrantyDays: 60,
      applicableAcTypes: ['SPLIT', 'WINDOW', 'CASSETTE'],
      inclusions: [
        'Complete electrical & thermal diagnostic report',
        'Itemised repair quote before any paid part replacement',
        'Inspection fee waived/adjusted if repair exceeds ₹800',
        '60-day warranty on VayuCare-supplied spare parts',
      ],
      exclusions: [
        'Cost of spare parts and repair labour (quoted after inspection)',
        'Refrigerant charging (quoted separately if leak detected)',
      ],
      preparationTips: [
        'Note any blinking error codes on the indoor display.',
      ],
      active: true,
      priceVersion: 4,
    },
    {
      id: 'svc-gas-refill',
      slug: 'gas-leak-refill',
      name: 'Gas Leak Check & Refrigerant Refill',
      category: 'GAS_REFILL',
      shortDescription:
        'Nitrogen pressure leak test, flare/brazing seal, vacuuming, and R32/R410A/R22 recharge.',
      detailedDescription:
        'Never top up refrigerant blindly. Our technicians pressure-test copper lines with nitrogen, seal leaks, pull a deep vacuum, and weigh-charge genuine refrigerant.',
      basePriceInr: 2299,
      additionalUnitDiscountPct: 10,
      estimatedDurationMins: 75,
      warrantyDays: 90,
      applicableAcTypes: ['SPLIT', 'WINDOW', 'CASSETTE'],
      inclusions: [
        'Nitrogen pressure leak detection test',
        'Minor flare nut tightening & brazing seal',
        'Vacuum pump moisture evacuation',
        'Full refrigerant weight-calibrated recharge',
        '90-day gas retention warranty',
      ],
      exclusions: [
        'Cooling coil replacement if severely corroded',
        'Copper pipe extensions beyond 2 meters',
      ],
      preparationTips: [
        'Ensure safe access to the outdoor condenser unit.',
      ],
      active: true,
      priceVersion: 2,
    },
    {
      id: 'svc-install',
      slug: 'split-ac-installation',
      name: 'Split AC Installation',
      category: 'INSTALLATION',
      shortDescription:
        'Laser-leveled indoor bracket mounting, core drilling, copper flaring, and vacuum test.',
      detailedDescription:
        'End-to-end Split AC mounting with anti-vibration outdoor pads, proper condensate slope, and leak testing.',
      basePriceInr: 1499,
      additionalUnitDiscountPct: 10,
      estimatedDurationMins: 90,
      warrantyDays: 30,
      applicableAcTypes: ['SPLIT'],
      inclusions: [
        'Indoor plate mounting & level alignment',
        'Standard wall core hole & copper pipe connection',
        'Outdoor bracket installation & vacuum leak check',
      ],
      exclusions: [
        'Extra copper piping (₹850/m), outdoor wall stand (₹650), drain pipe',
        'Heavy RCC beam cutting',
      ],
      preparationTips: [
        'Keep AC boxes unopened until the technician inspects seals.',
      ],
      active: true,
      priceVersion: 2,
    },
    {
      id: 'svc-uninstall',
      slug: 'ac-uninstallation',
      name: 'AC Uninstallation & Gas Lock',
      category: 'INSTALLATION',
      shortDescription:
        'Safe refrigerant pump-down into outdoor unit, copper disconnection, and neat packing.',
      detailedDescription:
        'Preserves existing refrigerant inside the compressor before dismantling indoor and outdoor units for relocation.',
      basePriceInr: 699,
      additionalUnitDiscountPct: 15,
      estimatedDurationMins: 45,
      warrantyDays: 15,
      applicableAcTypes: ['SPLIT', 'WINDOW'],
      inclusions: [
        'Refrigerant pump-down & valve locking',
        'Safe removal of indoor, outdoor, and wall plates',
        'Capping copper ends against dust & moisture',
      ],
      exclusions: [
        'Carton boxes or shifting transport',
      ],
      preparationTips: [
        'Confirm power is active for refrigerant pump-down.',
      ],
      active: true,
      priceVersion: 1,
    },
    {
      id: 'svc-amc',
      slug: 'annual-maintenance-plan',
      name: 'Jaipur Summer Shield AMC (2 Visits)',
      category: 'AMC',
      shortDescription:
        'Pre-summer foam-jet service + post-monsoon checkup + priority breakdown response.',
      detailedDescription:
        'Two scheduled Foam-Jet deep cleanings per year plus zero inspection charges on emergency breakdowns.',
      basePriceInr: 1899,
      additionalUnitDiscountPct: 15,
      estimatedDurationMins: 60,
      warrantyDays: 365,
      applicableAcTypes: ['SPLIT', 'WINDOW'],
      inclusions: [
        '2 Foam-Jet Deep Servicing visits within 12 months',
        'Zero diagnostic fee on breakdown calls',
        '10% discount on spare parts',
      ],
      exclusions: [
        'Refrigerant gas & major compressor replacements',
      ],
      preparationTips: [
        'First visit is scheduled immediately; second visit reminder sent in 5 months.',
      ],
      active: true,
      priceVersion: 1,
    },
  ];

  const coupons: Coupon[] = [
    {
      code: 'JAIPUR100',
      description: 'Flat ₹100 off on bookings above ₹499',
      discountType: 'FLAT',
      value: 100,
      minOrderInr: 499,
      maxDiscountInr: 100,
      active: true,
    },
    {
      code: 'COOL15',
      description: '15% off up to ₹250 on multi-unit or gas services',
      discountType: 'PERCENT',
      value: 15,
      minOrderInr: 900,
      maxDiscountInr: 250,
      active: true,
    },
  ];

  const technicians: Technician[] = [
    {
      id: 'tech-rajendra',
      name: 'Technician One',
      phone: '+91 00000 00001',
      city: 'Jaipur',
      baseLocality: 'Vaishali Nagar',
      serviceAreaIds: ['area-jpr-vaishali', 'area-jpr-mansarovar', 'area-jpr-cscheme'],
      skills: ['SERVICING', 'REPAIR', 'GAS_REFILL', 'AMC'],
      supportedAcTypes: ['SPLIT', 'WINDOW', 'CASSETTE'],
      experienceYears: 8,
      verificationStatus: 'APPROVED',
      online: true,
      rating: 4.9,
      completedJobsCount: 412,
      acceptanceRate: 96,
      onTimeRate: 94,
      currentLocation: { lat: 26.9065, lng: 75.7642 },
      earningsInr: 28450,
      documentsSubmitted: ['Aadhaar KYC', 'ITI Refrigeration Cert', 'Police Verification'],
    },
    {
      id: 'tech-vikram',
      name: 'Technician Two',
      phone: '+91 00000 00002',
      city: 'Jaipur',
      baseLocality: 'Malviya Nagar',
      serviceAreaIds: ['area-jpr-malviya', 'area-jpr-jagatpura', 'area-jpr-rajapark'],
      skills: ['SERVICING', 'REPAIR', 'GAS_REFILL', 'INSTALLATION', 'AMC'],
      supportedAcTypes: ['SPLIT', 'WINDOW'],
      experienceYears: 6,
      verificationStatus: 'APPROVED',
      online: true,
      rating: 4.8,
      completedJobsCount: 289,
      acceptanceRate: 92,
      onTimeRate: 91,
      currentLocation: { lat: 26.8612, lng: 75.8165 },
      earningsInr: 21300,
      documentsSubmitted: ['Aadhaar KYC', 'Manufacturer Split Cert', 'Police Verification'],
    },
    {
      id: 'tech-deepak',
      name: 'Technician Three',
      phone: '+91 00000 00003',
      city: 'Jaipur',
      baseLocality: 'C-Scheme',
      serviceAreaIds: ['area-jpr-cscheme', 'area-jpr-rajapark', 'area-jpr-vidyadhar'],
      skills: ['SERVICING', 'REPAIR', 'INSTALLATION'],
      supportedAcTypes: ['SPLIT', 'WINDOW', 'CASSETTE'],
      experienceYears: 5,
      verificationStatus: 'APPROVED',
      online: true,
      rating: 4.7,
      completedJobsCount: 175,
      acceptanceRate: 90,
      onTimeRate: 89,
      currentLocation: { lat: 26.9154, lng: 75.8031 },
      earningsInr: 15800,
      documentsSubmitted: ['Aadhaar KYC', 'HVAC Field Cert', 'Police Verification'],
    },
    {
      id: 'tech-arvind',
      name: 'Technician Four',
      phone: '+91 00000 00004',
      city: 'Jaipur',
      baseLocality: 'Vidyadhar Nagar',
      serviceAreaIds: ['area-jpr-vidyadhar', 'area-jpr-vaishali'],
      skills: ['SERVICING', 'REPAIR', 'GAS_REFILL'],
      supportedAcTypes: ['SPLIT', 'WINDOW'],
      experienceYears: 4,
      verificationStatus: 'PENDING',
      online: false,
      rating: 0,
      completedJobsCount: 0,
      acceptanceRate: 100,
      onTimeRate: 100,
      currentLocation: { lat: 26.9562, lng: 75.7785 },
      earningsInr: 0,
      documentsSubmitted: ['Aadhaar KYC', 'ITI Diploma (Awaiting Admin Review)'],
    },
  ];

  // Live seeded booking VC-JPR-4082 currently EN_ROUTE in Vaishali Nagar
  const liveDest = { lat: 26.9158, lng: 75.7412 };
  const liveStart = { lat: 26.8982, lng: 75.7768 };
  const liveWaypoints = generateRouteWaypoints(liveStart, liveDest, 14);
  const currentWaypointIdx = 5;
  const currentLoc = liveWaypoints[currentWaypointIdx];
  const distKm = haversineDistanceKm(currentLoc, liveDest);

  const liveService = services[2]; // AC Repair & Cooling Diagnostics
  const livePricing = calculatePriceSnapshot({
    service: liveService,
    quantity: 1,
  });

  const completedService = services[0]; // Foam-Jet
  const completedPricing = calculatePriceSnapshot({
    service: completedService,
    quantity: 2,
    coupon: coupons[0],
  });

  const bookings: Booking[] = [
    {
      id: 'bk-live-4082',
      reference: 'VC-JPR-4082',
      idempotencyKey: 'seed-live-4082',
      serviceId: liveService.id,
      serviceSlug: liveService.slug,
      serviceName: liveService.name,
      serviceCategory: liveService.category,
      status: 'TECHNICIAN_EN_ROUTE',
      acDetails: {
        acType: 'SPLIT',
        inverterType: 'INVERTER',
        brand: 'Daikin',
        tonnage: '1.5 Ton',
        quantity: 1,
        ageYears: '3 years',
        symptoms: ['Low cooling', 'Outdoor unit vibrating'],
      },
      address: {
        customerName: 'Demo Customer One',
        phone: '+91 00000 00005',
        pinCode: '302021',
        city: 'Jaipur',
        state: 'Rajasthan',
        locality: 'Vaishali Nagar',
        serviceAreaId: 'area-jpr-vaishali',
        houseNo: 'Demo House',
        street: 'Demo Service Lane',
        landmark: 'Demo Landmark',
        instructions: 'Demo service instructions',
        coordinates: liveDest,
      },
      scheduledDate: todayStr,
      slotId: 'slot-11',
      slotLabel: '11:00 AM – 12:30 PM',
      pricing: livePricing,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      transactionRef: 'UPI-JPR-88341209',
      assignedTechnicianId: 'tech-rajendra',
      offeredTechnicianIds: ['tech-rajendra'],
      rejectedTechnicianIds: [],
      tracking: {
        technicianId: 'tech-rajendra',
        currentLocation: currentLoc,
        destinationLocation: liveDest,
        routeWaypoints: liveWaypoints,
        routeProgressPct: Math.round((currentWaypointIdx / (liveWaypoints.length - 1)) * 100),
        distanceRemainingKm: distKm,
        etaMinutes: Math.max(2, Math.round(distKm * 3.8)),
        speedKmh: 26,
        autoDriving: false,
        lastUpdatedAt: fiveMinsAgo,
      },
      events: [
        {
          id: 'ev-1',
          status: 'CONFIRMED',
          title: 'Booking confirmed & paid via UPI',
          description: 'UPI payment verified (₹353 incl. GST).',
          actorRole: 'CUSTOMER',
          actorName: 'Demo User',
          timestamp: thirtyMinsAgo,
        },
        {
          id: 'ev-2',
          status: 'ASSIGNED',
          title: 'Technician Rajendra Sharma assigned',
          description: 'Verified Inverter Split AC specialist accepted your job.',
          actorRole: 'TECHNICIAN',
          actorName: 'Demo User',
          timestamp: fifteenMinsAgo,
        },
        {
          id: 'ev-3',
          status: 'TECHNICIAN_EN_ROUTE',
          title: 'Technician is on the way',
          description: 'Departed from Sodala hub toward Amrapali Circle, Vaishali Nagar.',
          actorRole: 'TECHNICIAN',
          actorName: 'Demo User',
          timestamp: fiveMinsAgo,
        },
      ],
      messages: [
        {
          id: 'msg-1',
          bookingId: 'bk-live-4082',
          senderRole: 'TECHNICIAN',
          senderName: 'Rajendra Sharma',
          text: 'Namaste Ananya ji, I have left from Queens Road and am heading to Vaishali Nagar. Reaching in ~11 mins.',
          timestamp: fiveMinsAgo,
        },
      ],
      createdAt: thirtyMinsAgo,
      updatedAt: fiveMinsAgo,
      assignedAt: fifteenMinsAgo,
    },
    {
      id: 'bk-done-3915',
      reference: 'VC-JPR-3915',
      idempotencyKey: 'seed-done-3915',
      serviceId: completedService.id,
      serviceSlug: completedService.slug,
      serviceName: completedService.name,
      serviceCategory: completedService.category,
      status: 'COMPLETED',
      acDetails: {
        acType: 'SPLIT',
        inverterType: 'INVERTER',
        brand: 'LG',
        tonnage: '1.5 Ton',
        quantity: 2,
        ageYears: '2 years',
        symptoms: ['Seasonal dust buildup'],
      },
      address: {
        customerName: 'Demo Customer Two',
        phone: '+91 00000 00006',
        pinCode: '302017',
        city: 'Jaipur',
        state: 'Rajasthan',
        locality: 'Malviya Nagar',
        serviceAreaId: 'area-jpr-malviya',
        houseNo: 'Demo House',
        street: 'Demo Service Lane',
        landmark: 'Demo Landmark',
        coordinates: { lat: 26.8545, lng: 75.8058 },
      },
      scheduledDate: twoDaysAgo.slice(0, 10),
      slotId: 'slot-14',
      slotLabel: '02:00 PM – 03:30 PM',
      pricing: completedPricing,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      transactionRef: 'UPI-JPR-77190234',
      assignedTechnicianId: 'tech-vikram',
      offeredTechnicianIds: ['tech-vikram'],
      rejectedTechnicianIds: [],
      completionNotes: 'Both bedroom Split AC indoor & condenser coils jet-washed. Supply vent temp dropped from 19.2°C to 8.4°C.',
      events: [
        {
          id: 'ev-c1',
          status: 'CONFIRMED',
          title: 'Booking confirmed',
          description: 'Paid ₹1,211 via UPI (2 units + JAIPUR100).',
          actorRole: 'CUSTOMER',
          actorName: 'Demo User',
          timestamp: twoDaysAgo,
        },
        {
          id: 'ev-c2',
          status: 'COMPLETED',
          title: 'Service completed & verified',
          description: '30-day Foam-Jet workmanship warranty activated.',
          actorRole: 'TECHNICIAN',
          actorName: 'Demo User',
          timestamp: twoDaysAgo,
        },
      ],
      messages: [],
      review: {
        id: 'rev-3915',
        rating: 5,
        serviceQualityRating: 5,
        punctualityRating: 5,
        customerName: 'Demo Customer Three',
        locality: 'Malviya Nagar, Jaipur',
        comment:
          'Vikram arrived 5 minutes early, put waterproof jackets on both LG units so zero water hit our walls, and showed the coil temperature drop on his meter.',
        createdAt: twoDaysAgo,
      },
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
      assignedAt: twoDaysAgo,
      completedAt: twoDaysAgo,
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-1',
      actorRole: 'SYSTEM',
      actorName: 'Demo User',
      action: 'TECH_ASSIGNED',
      entityType: 'BOOKING',
      entityId: 'bk-live-4082',
      summary: 'Assigned Rajendra Sharma to VC-JPR-4082 (Vaishali Nagar, Score 91.4)',
      timestamp: fifteenMinsAgo,
    },
    {
      id: 'aud-2',
      actorRole: 'SYSTEM',
      actorName: 'Demo User',
      action: 'TECH_APPLICATION_RECEIVED',
      entityType: 'TECHNICIAN',
      entityId: 'tech-arvind',
      summary: 'Arvind Meena submitted KYC & ITI Diploma for Vidyadhar Nagar review',
      timestamp: twoDaysAgo,
    },
  ];

  return {
    serviceAreas,
    services,
    coupons,
    technicians,
    bookings,
    complaints: [],
    auditLogs,
  };
}

interface SnapshotEnvelope {
  version: number;
  state: DatabaseState;
}

function isDatabaseState(value: unknown): value is DatabaseState {
  const candidate = value as Partial<DatabaseState> | null;
  return Boolean(candidate && Array.isArray(candidate.services) && Array.isArray(candidate.bookings));
}

function parseSnapshot(raw: string): SnapshotEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'state' in (parsed as Record<string, unknown>)) {
      const envelope = parsed as { version?: unknown; state?: unknown };
      if (!isDatabaseState(envelope.state)) return null;
      return {
        version: typeof envelope.version === 'number' ? envelope.version : 1,
        state: envelope.state,
      };
    }
    // Snapshots written before versioning stored the raw state object
    // (data/vayucare-db.json in the repo).
    if (isDatabaseState(parsed)) return { version: 1, state: parsed };
    return null;
  } catch (err) {
    console.error('[vayucare] Failed to parse persisted snapshot:', err);
    return null;
  }
}

class PersistentStore {
  private state: DatabaseState;
  private version = 1;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly backend: SnapshotBackend = createSnapshotBackend();
  private hydrated = false;
  private lastSyncAt = 0;

  constructor() {
    const snapshot = this.backend.loadSync?.() ?? null;
    const restored = snapshot ? parseSnapshot(snapshot) : null;
    if (restored) {
      this.state = restored.state;
      this.version = restored.version;
    } else {
      this.state = createSeedState();
      if (this.backend.kind === 'file') void this.persist();
    }
    if (this.backend.kind === 'memory') {
      console.warn(`[vayucare] Using in-memory state only. ${SNAPSHOT_BACKEND_HINT}`);
    }
  }

  /**
   * Refreshes state from the shared snapshot store before a request runs, so
   * every serverless instance (and cold start) sees the same data.
   */
  async hydrate(force = false): Promise<void> {
    if (this.backend.kind !== 'redis') {
      this.hydrated = true;
      return;
    }
    const now = Date.now();
    if (!force && this.hydrated && now - this.lastSyncAt < 750) return;

    try {
      await this.writeQueue;
      const raw = await this.backend.load();
      const snapshot = raw ? parseSnapshot(raw) : null;
      if (snapshot) {
        this.state = snapshot.state;
        this.version = snapshot.version;
      } else {
        await this.persist();
      }
    } catch (err) {
      console.error('[vayucare] Snapshot sync failed, using this instance state:', err);
    } finally {
      this.hydrated = true;
      this.lastSyncAt = Date.now();
    }
  }

  private persist(): Promise<void> {
    const payload = JSON.stringify({ version: this.version, state: this.state } satisfies SnapshotEnvelope);
    return this.backend.save(payload).catch((err) => {
      console.error('[vayucare] Failed to persist snapshot:', err);
    });
  }

  getVersion(): number {
    return this.version;
  }

  async mutate<T>(fn: (draft: DatabaseState) => T): Promise<T> {
    const run = this.writeQueue.then(async () => {
      await this.hydrate(true);
      const result = fn(this.state);
      this.version += 1;
      await this.persist();
      return result;
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  read(): DatabaseState {
    return this.state;
  }

  addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
    this.state.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.state.auditLogs.length > 150) {
      this.state.auditLogs.length = 150;
    }
  }

  getSlotAvailability(params: {
    date: string;
    serviceAreaId: string;
    serviceCategory: string;
    acType: string;
  }): SlotAvailability[] {
    const { date, serviceAreaId, serviceCategory, acType } = params;
    const eligibleTechs = this.state.technicians.filter(
      (t) =>
        t.verificationStatus === 'APPROVED' &&
        t.online &&
        t.skills.includes(serviceCategory as Technician['skills'][number]) &&
        t.supportedAcTypes.includes(acType as Technician['supportedAcTypes'][number]) &&
        t.serviceAreaIds.includes(serviceAreaId),
    );

    // Fallback to city-wide online verified technicians if locality pool is small
    const pool =
      eligibleTechs.length > 0
        ? eligibleTechs
        : this.state.technicians.filter(
            (t) =>
              t.verificationStatus === 'APPROVED' &&
              t.online &&
              t.skills.includes(serviceCategory as Technician['skills'][number]),
          );

    const todayStr = new Date().toISOString().slice(0, 10);
    const currentHour = new Date().getHours();

    return TIME_SLOTS.map((slot) => {
      const busyIds = new Set(
        this.state.bookings
          .filter(
            (b) =>
              b.scheduledDate === date &&
              b.slotId === slot.slotId &&
              b.assignedTechnicianId &&
              b.status !== 'CANCELLED' &&
              b.status !== 'COMPLETED',
          )
          .map((b) => b.assignedTechnicianId as string),
      );
      const freeCount = pool.filter((t) => !busyIds.has(t.id)).length;
      const isPastToday = date === todayStr && slot.startHour + 1 <= currentHour;

      return {
        slotId: slot.slotId,
        label: slot.label,
        startHour: slot.startHour,
        availableTechnicians: isPastToday ? 0 : freeCount,
        available: !isPastToday && freeCount > 0,
      };
    });
  }

  getAdminOverviewStats(): AdminOverviewStats {
    const { bookings, technicians } = this.state;
    const todayStr = new Date().toISOString().slice(0, 10);
    const completed = bookings.filter((b) => b.status === 'COMPLETED');
    const cancelled = bookings.filter((b) => b.status === 'CANCELLED');
    const pendingAssignments = bookings.filter(
      (b) => b.status === 'ASSIGNMENT_PENDING' || b.status === 'CONFIRMED',
    ).length;
    const activeInProgress = bookings.filter((b) =>
      [
        'ASSIGNED',
        'TECHNICIAN_EN_ROUTE',
        'TECHNICIAN_ARRIVED',
        'INSPECTION_IN_PROGRESS',
        'QUOTE_PENDING',
        'QUOTE_APPROVED',
        'SERVICE_IN_PROGRESS',
      ].includes(b.status),
    ).length;

    const paidOrCompleted = bookings.filter(
      (b) => b.status !== 'CANCELLED' && (b.paymentStatus === 'PAID' || b.status === 'COMPLETED'),
    );
    const grossBookingValueInr = paidOrCompleted.reduce(
      (sum, b) => sum + b.pricing.grandTotalInr,
      0,
    );
    const gstCollectedInr = paidOrCompleted.reduce(
      (sum, b) => sum + b.pricing.gstAmountInr + (b.quote?.status === 'APPROVED' ? b.quote.gstAmountInr : 0),
      0,
    );
    const netExGst = Math.max(0, grossBookingValueInr - gstCollectedInr);
    const platformCommissionInr = Math.round(netExGst * 0.22);
    const technicianPayoutsInr = netExGst - platformCommissionInr;

    const rated = bookings.filter((b) => b.review);
    const averageRating =
      rated.length > 0
        ? Number(
            (
              rated.reduce((sum, b) => sum + (b.review?.rating ?? 0), 0) / rated.length
            ).toFixed(2),
          )
        : 4.85;

    const assignedBookings = bookings.filter((b) => b.assignedAt);
    const averageAssignmentMins =
      assignedBookings.length > 0
        ? Math.max(
            1,
            Math.round(
              assignedBookings.reduce((sum, b) => {
                const diff =
                  new Date(b.assignedAt as string).getTime() -
                  new Date(b.createdAt).getTime();
                return sum + Math.max(1, diff / 60000);
              }, 0) / assignedBookings.length,
            ),
          )
        : 4;

    const totalDecided = completed.length + cancelled.length;
    const completionRatePct =
      totalDecided > 0 ? Math.round((completed.length / totalDecided) * 100) : 100;

    return {
      totalBookings: bookings.length,
      todayBookings: bookings.filter((b) => b.scheduledDate === todayStr).length,
      pendingAssignments,
      activeInProgress,
      completedBookings: completed.length,
      cancelledBookings: cancelled.length,
      activeTechnicians: technicians.filter((t) => t.verificationStatus === 'APPROVED').length,
      onlineTechnicians: technicians.filter(
        (t) => t.verificationStatus === 'APPROVED' && t.online,
      ).length,
      grossBookingValueInr,
      platformCommissionInr,
      technicianPayoutsInr,
      gstCollectedInr,
      averageOrderValueInr:
        paidOrCompleted.length > 0
          ? Math.round(grossBookingValueInr / paidOrCompleted.length)
          : 0,
      completionRatePct,
      averageAssignmentMins,
      averageRating,
    };
  }
}

export const db = new PersistentStore();
