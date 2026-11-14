import type {
  AdminOverviewStats,
  AuditLogEntry,
  AuthUser,
  Booking,
  BookingComplaint,
  Coupon,
  PriceSnapshot,
  ServiceArea,
  ServicePackage,
  SlotAvailability,
  Technician,
  UserRole,
} from '../../shared/types';

export interface EnrichedBooking extends Booking {
  assignedTechnician?: Technician;
}

export interface BootstrapResponse {
  serviceAreas: ServiceArea[];
  services: ServicePackage[];
  coupons: Coupon[];
  reviews: Array<{
    id: string;
    rating: number;
    comment: string;
    serviceQualityRating: number;
    punctualityRating: number;
    customerName: string;
    locality: string;
    createdAt: string;
    serviceName: string;
    bookingReference: string;
  }>;
  timeSlots: Array<{ slotId: string; label: string; startHour: number }>;
}

const TOKEN_KEY = 'vayucare_session_token';

export function getStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage restriction
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatIstTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export const api = {
  // Auth
  login: async (payload: {
    role: UserRole;
    identifier: string;
    passcode?: string;
    name?: string;
  }) => {
    const res = await request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    return res;
  },

  logout: async () => {
    try {
      await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  getMe: () => request<{ user: AuthUser }>('/api/auth/me'),

  getBootstrap: () => request<BootstrapResponse>('/api/bootstrap'),

  checkServiceability: (payload: { pinCode?: string; serviceAreaId?: string }) =>
    request<{
      serviceable: boolean;
      message: string;
      matchedArea: ServiceArea | null;
    }>('/api/serviceability/check', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  previewPricing: (payload: { serviceId: string; quantity: number; couponCode?: string }) =>
    request<{
      pricing: PriceSnapshot;
      couponApplied: boolean;
      couponMessage: string | null;
    }>('/api/pricing/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSlots: (params: {
    date: string;
    serviceAreaId: string;
    serviceCategory: string;
    acType: string;
  }) => {
    const q = new URLSearchParams(params);
    return request<{ date: string; slots: SlotAvailability[] }>(`/api/slots?${q.toString()}`);
  },

  listBookings: () => request<{ bookings: EnrichedBooking[] }>('/api/bookings'),

  getBooking: (idOrRef: string) =>
    request<{ booking: EnrichedBooking }>(`/api/bookings/${encodeURIComponent(idOrRef)}`),

  createBooking: (payload: Record<string, unknown>) =>
    request<{ booking: EnrichedBooking }>('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelBooking: (id: string, reason: string) =>
    request<{ booking: EnrichedBooking }>(`/api/bookings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  sendMessage: (
    bookingId: string,
    payload: { senderRole: 'CUSTOMER' | 'TECHNICIAN'; senderName: string; text: string },
  ) =>
    request<{ message: Booking['messages'][number] }>(`/api/bookings/${bookingId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  respondToQuote: (
    bookingId: string,
    payload: { decision: 'APPROVED' | 'REJECTED'; customerNote?: string },
  ) =>
    request<{ booking: EnrichedBooking }>(`/api/bookings/${bookingId}/quote/respond`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitReview: (
    bookingId: string,
    payload: {
      rating: number;
      serviceQualityRating: number;
      punctualityRating: number;
      comment: string;
    },
  ) =>
    request<{ booking: EnrichedBooking }>(`/api/bookings/${bookingId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  raiseComplaint: (
    bookingId: string,
    payload: {
      category: 'COOLING_ISSUE' | 'WARRANTY_REVISIT' | 'BILLING' | 'BEHAVIOUR';
      description: string;
    },
  ) =>
    request<{ complaint: BookingComplaint }>(`/api/bookings/${bookingId}/complaint`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Technician Portal
  getTechnicianPortal: () =>
    request<{
      activeTechnician: Technician;
      jobs: EnrichedBooking[];
      serviceAreas: ServiceArea[];
    }>('/api/technician/portal'),

  registerTechnician: (payload: Record<string, unknown>) =>
    request<{ technician: Technician }>('/api/technician/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleTechnicianOnline: (techId: string) =>
    request<{ technician: Technician }>(`/api/technician/${techId}/toggle-online`, {
      method: 'POST',
    }),

  rejectJob: (bookingId: string, technicianId: string) =>
    request<{ booking: EnrichedBooking }>(`/api/technician/jobs/${bookingId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ technicianId }),
    }),

  advanceJob: (
    bookingId: string,
    payload: {
      technicianId: string;
      nextStatus:
        | 'TECHNICIAN_EN_ROUTE'
        | 'TECHNICIAN_ARRIVED'
        | 'INSPECTION_IN_PROGRESS'
        | 'SERVICE_IN_PROGRESS'
        | 'COMPLETED';
      notes?: string;
    },
  ) =>
    request<{ booking: EnrichedBooking }>(`/api/technician/jobs/${bookingId}/advance`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  stepTechnicianLocation: (bookingId: string, technicianId: string) =>
    request<{ booking: EnrichedBooking }>(`/api/technician/jobs/${bookingId}/location`, {
      method: 'POST',
      body: JSON.stringify({ technicianId, stepForward: true }),
    }),

  toggleAutoDrive: (bookingId: string, technicianId: string, enabled: boolean) =>
    request<{ booking: EnrichedBooking }>(`/api/technician/jobs/${bookingId}/auto-drive`, {
      method: 'POST',
      body: JSON.stringify({ technicianId, enabled }),
    }),

  submitQuote: (
    bookingId: string,
    payload: {
      technicianId: string;
      diagnosis: string;
      estimatedExtraMins: number;
      items: Array<{
        partName: string;
        quantity: number;
        unitPriceInr: number;
        labourInr: number;
        warrantyDays: number;
      }>;
    },
  ) =>
    request<{ booking: EnrichedBooking }>(`/api/technician/jobs/${bookingId}/quote`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin Ops
  getAdminOverview: () =>
    request<{
      stats: AdminOverviewStats;
      bookings: EnrichedBooking[];
      technicians: Technician[];
      services: ServicePackage[];
      serviceAreas: ServiceArea[];
      complaints: BookingComplaint[];
      auditLogs: AuditLogEntry[];
    }>('/api/admin/overview'),

  adminAssignTechnician: (bookingId: string, technicianId: string) =>
    request<{ booking: EnrichedBooking }>(`/api/admin/bookings/${bookingId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ technicianId }),
    }),

  adminVerifyTechnician: (techId: string, status: 'APPROVED' | 'SUSPENDED' | 'PENDING') =>
    request<{ technician: Technician }>(`/api/admin/technicians/${techId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  adminUpdateService: (serviceId: string, payload: { basePriceInr?: number; active?: boolean }) =>
    request<{ service: ServicePackage }>(`/api/admin/services/${serviceId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminToggleServiceArea: (areaId: string) =>
    request<{ serviceArea: ServiceArea }>(`/api/admin/service-areas/${areaId}/toggle`, {
      method: 'POST',
    }),

  adminResolveComplaint: (complaintId: string, resolutionNote: string) =>
    request<{ complaint: BookingComplaint }>(`/api/admin/complaints/${complaintId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolutionNote }),
    }),
};
