export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'ASSIGNMENT_PENDING'
  | 'ASSIGNED'
  | 'TECHNICIAN_EN_ROUTE'
  | 'TECHNICIAN_ARRIVED'
  | 'INSPECTION_IN_PROGRESS'
  | 'QUOTE_PENDING'
  | 'QUOTE_APPROVED'
  | 'SERVICE_IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ACType = 'SPLIT' | 'WINDOW' | 'CASSETTE';
export type ACInverterType = 'INVERTER' | 'NON_INVERTER' | 'UNSURE';
export type ServiceCategory = 'SERVICING' | 'REPAIR' | 'GAS_REFILL' | 'INSTALLATION' | 'AMC';
export type PaymentMethod = 'UPI' | 'CARD' | 'PAY_AFTER_SERVICE';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PAY_ON_COMPLETION' | 'REFUNDED';
export type TechnicianVerificationStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ServiceArea {
  id: string;
  city: string;
  state: string;
  locality: string;
  pinCode: string;
  active: boolean;
  center: LatLng;
  estimatedArrivalMins: number;
}

export interface ServicePackage {
  id: string;
  slug: string;
  name: string;
  category: ServiceCategory;
  shortDescription: string;
  detailedDescription: string;
  basePriceInr: number;
  additionalUnitDiscountPct: number;
  estimatedDurationMins: number;
  warrantyDays: number;
  applicableAcTypes: ACType[];
  inclusions: string[];
  exclusions: string[];
  preparationTips: string[];
  active: boolean;
  priceVersion: number;
}

export interface Coupon {
  code: string;
  description: string;
  discountType: 'FLAT' | 'PERCENT';
  value: number;
  minOrderInr: number;
  maxDiscountInr: number;
  active: boolean;
}

export interface Technician {
  id: string;
  name: string;
  phone: string;
  city: string;
  baseLocality: string;
  serviceAreaIds: string[];
  skills: ServiceCategory[];
  supportedAcTypes: ACType[];
  experienceYears: number;
  verificationStatus: TechnicianVerificationStatus;
  online: boolean;
  rating: number;
  completedJobsCount: number;
  acceptanceRate: number;
  onTimeRate: number;
  currentLocation: LatLng;
  earningsInr: number;
  documentsSubmitted: string[];
}

export interface ACUnitInput {
  acType: ACType;
  inverterType: ACInverterType;
  brand: string;
  tonnage: string;
  quantity: number;
  ageYears?: string;
  symptoms: string[];
}

export interface CustomerAddress {
  customerName: string;
  phone: string;
  pinCode: string;
  city: string;
  state: string;
  locality: string;
  serviceAreaId: string;
  houseNo: string;
  street: string;
  landmark?: string;
  instructions?: string;
  coordinates: LatLng;
}

export interface PriceSnapshot {
  serviceId: string;
  serviceName: string;
  priceVersion: number;
  unitCount: number;
  baseUnitPriceInr: number;
  subtotalInr: number;
  multiUnitSavingsInr: number;
  couponCode?: string;
  discountInr: number;
  taxableAmountInr: number;
  gstRatePct: number;
  gstAmountInr: number;
  totalPayableInr: number;
  approvedQuoteTotalInr: number;
  grandTotalInr: number;
}

export interface BookingEvent {
  id: string;
  status: BookingStatus;
  title: string;
  description: string;
  actorRole: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN' | 'SYSTEM';
  actorName: string;
  timestamp: string;
}

export interface RepairQuoteItem {
  id: string;
  partName: string;
  quantity: number;
  unitPriceInr: number;
  labourInr: number;
  warrantyDays: number;
}

export interface RepairQuote {
  id: string;
  bookingId: string;
  technicianId: string;
  diagnosis: string;
  estimatedExtraMins: number;
  items: RepairQuoteItem[];
  subtotalInr: number;
  gstAmountInr: number;
  totalInr: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  customerNote?: string;
  submittedAt: string;
  respondedAt?: string;
}

export interface ChatMessage {
  id: string;
  bookingId: string;
  senderRole: 'CUSTOMER' | 'TECHNICIAN' | 'SYSTEM';
  senderName: string;
  text: string;
  timestamp: string;
}

export interface TechnicianTrackingState {
  technicianId: string;
  currentLocation: LatLng;
  destinationLocation: LatLng;
  routeWaypoints: LatLng[];
  routeProgressPct: number;
  distanceRemainingKm: number;
  etaMinutes: number;
  speedKmh: number;
  autoDriving: boolean;
  lastUpdatedAt: string;
}

export interface BookingReview {
  id: string;
  rating: number;
  comment: string;
  serviceQualityRating: number;
  punctualityRating: number;
  customerName: string;
  locality: string;
  createdAt: string;
}

export interface BookingComplaint {
  id: string;
  bookingId: string;
  bookingReference: string;
  customerName: string;
  category: 'COOLING_ISSUE' | 'WARRANTY_REVISIT' | 'BILLING' | 'BEHAVIOUR';
  description: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
  resolutionNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface Booking {
  id: string;
  reference: string;
  idempotencyKey: string;
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  serviceCategory: ServiceCategory;
  status: BookingStatus;
  acDetails: ACUnitInput;
  address: CustomerAddress;
  scheduledDate: string;
  slotId: string;
  slotLabel: string;
  pricing: PriceSnapshot;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  transactionRef?: string;
  assignedTechnicianId?: string;
  offeredTechnicianIds: string[];
  rejectedTechnicianIds: string[];
  tracking?: TechnicianTrackingState;
  quote?: RepairQuote;
  inspectionNotes?: string;
  completionNotes?: string;
  events: BookingEvent[];
  messages: ChatMessage[];
  review?: BookingReview;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;
  completedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  actorRole: 'ADMIN' | 'SYSTEM' | 'TECHNICIAN' | 'CUSTOMER';
  actorName: string;
  action: string;
  entityType: 'BOOKING' | 'TECHNICIAN' | 'SERVICE' | 'SERVICE_AREA' | 'COMPLAINT' | 'QUOTE';
  entityId: string;
  summary: string;
  timestamp: string;
}

export interface SlotAvailability {
  slotId: string;
  label: string;
  startHour: number;
  availableTechnicians: number;
  available: boolean;
}

export interface AdminOverviewStats {
  totalBookings: number;
  todayBookings: number;
  pendingAssignments: number;
  activeInProgress: number;
  completedBookings: number;
  cancelledBookings: number;
  activeTechnicians: number;
  onlineTechnicians: number;
  grossBookingValueInr: number;
  platformCommissionInr: number;
  technicianPayoutsInr: number;
  gstCollectedInr: number;
  averageOrderValueInr: number;
  completionRatePct: number;
  averageAssignmentMins: number;
  averageRating: number;
}

export type WSEvent =
  | { type: 'booking:updated'; payload: { booking: Booking } }
  | { type: 'booking:created'; payload: { booking: Booking } }
  | {
      type: 'technician:location';
      payload: {
        bookingId: string;
        tracking: TechnicianTrackingState;
      };
    }
  | { type: 'chat:message'; payload: { bookingId: string; message: ChatMessage } }
  | { type: 'quote:submitted'; payload: { bookingId: string; quote: RepairQuote } }
  | { type: 'quote:responded'; payload: { bookingId: string; quote: RepairQuote; status: BookingStatus } }
  | { type: 'technician:status'; payload: { technician: Technician } }
  | { type: 'ops:refresh'; payload: { reason: string } };

export type UserRole = 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  identifier: string;
  technicianId?: string;
}

