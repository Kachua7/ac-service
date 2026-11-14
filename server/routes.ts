import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type {
  Booking,
  BookingStatus,
  LatLng,
  RepairQuote,
  ServiceArea,
} from '../shared/types';
import {
  type AuthenticatedRequest,
  authenticateUser,
  extractBearerToken,
  getSessionUser,
  normalizePhone,
  requireAuth,
  revokeSession,
} from './auth';
import {
  findAndRankTechnicians,
  generateRouteWaypoints,
  haversineDistanceKm,
} from './dispatch';
import { calculatePriceSnapshot, calculateQuoteTotals } from './pricing';
import { db, TIME_SLOTS, VALID_STATE_TRANSITIONS } from './store';
import { realtimeHub } from './realtime';

const AUTO_DRIVE_STEP_MS = 1200;
let lastAutoDriveAdvanceAt = 0;

/**
 * Serverless functions cannot keep timers alive between requests, so the
 * simulated "auto drive" is advanced by the realtime poll that every open
 * client already sends. On a long-running host the result is identical.
 */
async function advanceAutoDrivingBookings() {
  if (Date.now() - lastAutoDriveAdvanceAt < AUTO_DRIVE_STEP_MS) return;
  lastAutoDriveAdvanceAt = Date.now();

  const moving = db
    .read()
    .bookings.filter((b) => b.tracking?.autoDriving && b.status === 'TECHNICIAN_EN_ROUTE');

  for (const booking of moving) {
    let updated: Booking | null = null;
    try {
      updated = await db.mutate((draft) => {
        const target = draft.bookings.find((item) => item.id === booking.id);
        if (!target || !target.tracking || target.status !== 'TECHNICIAN_EN_ROUTE') return null;

        const waypoints = target.tracking.routeWaypoints;
        const maxIdx = waypoints.length - 1;
        const currentIdx = Math.round((target.tracking.routeProgressPct / 100) * maxIdx);
        const nextIdx = Math.min(maxIdx, currentIdx + 1);
        const nextLoc = waypoints[nextIdx];
        const dist = haversineDistanceKm(nextLoc, target.tracking.destinationLocation);
        const pct = maxIdx > 0 ? Math.round((nextIdx / maxIdx) * 100) : 100;

        target.tracking.currentLocation = nextLoc;
        target.tracking.routeProgressPct = pct;
        target.tracking.distanceRemainingKm = dist;
        target.tracking.etaMinutes = pct >= 100 ? 0 : Math.max(1, Math.round(dist * 3.8));
        target.tracking.lastUpdatedAt = new Date().toISOString();

        if (pct >= 100) target.tracking.autoDriving = false;

        return target;
      });
    } catch (err) {
      console.error('[vayucare] Auto-drive step failed:', err);
      continue;
    }

    if (updated?.tracking) {
      realtimeHub.broadcastBookingUpdate(updated.id, {
        type: 'technician:location',
        payload: { bookingId: updated.id, tracking: updated.tracking },
      });
    }
  }
}

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : (val ?? '');
}

function enrichBooking(booking: Booking) {
  const state = db.read();
  const assignedTechnician = booking.assignedTechnicianId
    ? state.technicians.find((t) => t.id === booking.assignedTechnicianId)
    : undefined;
  return {
    ...booking,
    assignedTechnician,
  };
}

function addJitter(center: LatLng): LatLng {
  const offsetLat = (Math.random() - 0.5) * 0.012;
  const offsetLng = (Math.random() - 0.5) * 0.012;
  return {
    lat: Number((center.lat + offsetLat).toFixed(6)),
    lng: Number((center.lng + offsetLng).toFixed(6)),
  };
}

const createBookingSchema = z.object({
  idempotencyKey: z.string().min(6),
  serviceId: z.string().min(1),
  couponCode: z.string().optional(),
  paymentMethod: z.enum(['UPI', 'CARD', 'PAY_AFTER_SERVICE']),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.string().min(1),
  acDetails: z.object({
    acType: z.enum(['SPLIT', 'WINDOW', 'CASSETTE']),
    inverterType: z.enum(['INVERTER', 'NON_INVERTER', 'UNSURE']),
    brand: z.string().min(1).max(40),
    tonnage: z.string().min(1).max(20),
    quantity: z.number().int().min(1).max(10),
    ageYears: z.string().optional(),
    symptoms: z.array(z.string()).default([]),
  }),
  address: z.object({
    customerName: z.string().min(2).max(80),
    phone: z.string().min(8).max(20),
    pinCode: z.string().regex(/^\d{6}$/),
    serviceAreaId: z.string().min(1),
    houseNo: z.string().min(1).max(80),
    street: z.string().min(2).max(120),
    landmark: z.string().optional(),
    instructions: z.string().optional(),
  }),
});

const quoteSubmissionSchema = z.object({
  technicianId: z.string().min(1),
  diagnosis: z.string().min(5).max(500),
  estimatedExtraMins: z.number().int().min(10).max(360),
  items: z
    .array(
      z.object({
        partName: z.string().min(2).max(120),
        quantity: z.number().int().min(1).max(20),
        unitPriceInr: z.number().min(0).max(50000),
        labourInr: z.number().min(0).max(15000),
        warrantyDays: z.number().int().min(0).max(730),
      }),
    )
    .min(1),
});

export function registerApiRoutes(app: Express) {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'vayucare-marketplace', timestamp: new Date().toISOString() });
  });

  // Realtime transport: clients poll for events after their last sequence
  // number instead of holding a WebSocket (unsupported on serverless).
  app.get('/api/realtime/events', async (req: Request, res: Response) => {
    await advanceAutoDrivingBookings();
    const rawSince = Number(req.query.since ?? 0);
    const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0;
    res.set('Cache-Control', 'no-store');
    res.json({
      seq: realtimeHub.getSeq(),
      version: db.getVersion(),
      events: realtimeHub.since(since),
    });
  });

  // --- AUTHENTICATION & SESSION APIs ---

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const schema = z.object({
      role: z.enum(['CUSTOMER', 'TECHNICIAN', 'ADMIN']),
      identifier: z.string().min(3).max(100),
      passcode: z.string().max(60).optional(),
      name: z.string().max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter valid sign-in credentials.' });
      return;
    }
    const result = authenticateUser(parsed.data);
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ token: result.token, user: result.user });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    revokeSession(extractBearerToken(req));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getSessionUser(extractBearerToken(req));
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user });
  });

  app.get('/api/bootstrap', (_req: Request, res: Response) => {
    const state = db.read();
    const verifiedReviews = state.bookings
      .filter((b) => b.review)
      .map((b) => ({
        ...b.review!,
        serviceName: b.serviceName,
        bookingReference: b.reference,
      }));
    res.json({
      serviceAreas: state.serviceAreas,
      services: state.services,
      coupons: state.coupons.filter((c) => c.active),
      reviews: verifiedReviews,
      timeSlots: TIME_SLOTS,
    });
  });

  app.post('/api/serviceability/check', (req: Request, res: Response) => {
    const schema = z.object({
      pinCode: z.string().optional(),
      serviceAreaId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid serviceability query' });
      return;
    }

    const { pinCode, serviceAreaId } = parsed.data;
    const state = db.read();
    let matched: ServiceArea | undefined;

    if (serviceAreaId) {
      matched = state.serviceAreas.find((a) => a.id === serviceAreaId);
    } else if (pinCode) {
      matched = state.serviceAreas.find((a) => a.pinCode === pinCode.trim());
    }

    if (!matched) {
      res.json({
        serviceable: false,
        message:
          'We currently serve Jaipur PIN codes (302001, 302004, 302017, 302018, 302020, 302021, 302039). Expansion across Jodhpur & Udaipur is in pilot.',
        matchedArea: null,
      });
      return;
    }

    if (!matched.active) {
      res.json({
        serviceable: false,
        message: `${matched.locality}, ${matched.city} is listed for upcoming expansion and is not active for bookings yet.`,
        matchedArea: matched,
      });
      return;
    }

    res.json({
      serviceable: true,
      message: `Active coverage in ${matched.locality}, ${matched.city}. Typical technician dispatch in ~${matched.estimatedArrivalMins} mins.`,
      matchedArea: matched,
    });
  });

  app.post('/api/pricing/preview', (req: Request, res: Response) => {
    const schema = z.object({
      serviceId: z.string().min(1),
      quantity: z.number().int().min(1).max(10),
      couponCode: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid pricing preview request' });
      return;
    }
    const state = db.read();
    const service = state.services.find((s) => s.id === parsed.data.serviceId && s.active);
    if (!service) {
      res.status(404).json({ error: 'Service not found or inactive' });
      return;
    }
    const cleanCode = parsed.data.couponCode?.trim().toUpperCase();
    const coupon = cleanCode
      ? state.coupons.find((c) => c.code === cleanCode && c.active)
      : undefined;
    const snapshot = calculatePriceSnapshot({
      service,
      quantity: parsed.data.quantity,
      coupon,
    });
    res.json({
      pricing: snapshot,
      couponApplied: Boolean(snapshot.couponCode),
      couponMessage:
        cleanCode && !snapshot.couponCode
          ? `Coupon "${cleanCode}" is invalid or requires a higher minimum subtotal.`
          : snapshot.couponCode
            ? `Coupon ${snapshot.couponCode} applied: saved ₹${snapshot.discountInr}`
            : null,
    });
  });

  app.get('/api/slots', (req: Request, res: Response) => {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const serviceAreaId = typeof req.query.serviceAreaId === 'string' ? req.query.serviceAreaId : 'area-jpr-vaishali';
    const serviceCategory = typeof req.query.serviceCategory === 'string' ? req.query.serviceCategory : 'SERVICING';
    const acType = typeof req.query.acType === 'string' ? req.query.acType : 'SPLIT';

    const slots = db.getSlotAvailability({
      date,
      serviceAreaId,
      serviceCategory,
      acType,
    });
    res.json({ date, slots });
  });

  app.get('/api/bookings', requireAuth(['CUSTOMER', 'ADMIN']), (req: AuthenticatedRequest, res: Response) => {
    const state = db.read();
    const user = req.authUser!;
    const filtered =
      user.role === 'ADMIN'
        ? state.bookings
        : state.bookings.filter(
            (b) => normalizePhone(b.address.phone) === normalizePhone(user.identifier),
          );
    const sorted = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(enrichBooking);
    res.json({ bookings: sorted });
  });

  app.get('/api/bookings/:idOrRef', requireAuth(['CUSTOMER', 'TECHNICIAN', 'ADMIN']), (req: AuthenticatedRequest, res: Response) => {
    const idOrRef = getParam(req, 'idOrRef');
    const state = db.read();
    const booking = state.bookings.find(
      (b) => b.id === idOrRef || b.reference.toLowerCase() === idOrRef.toLowerCase(),
    );
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (
      req.authUser?.role === 'TECHNICIAN' &&
      booking.assignedTechnicianId !== req.authUser.technicianId
    ) {
      res.status(403).json({ error: 'Access denied to unassigned booking.' });
      return;
    }
    res.json({ booking: enrichBooking(booking) });
  });

  app.post('/api/bookings', requireAuth(['CUSTOMER', 'ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const input = parsed.data;

    try {
      const createdBooking = await db.mutate((draft) => {
        // Idempotency protection against double submission
        const existing = draft.bookings.find((b) => b.idempotencyKey === input.idempotencyKey);
        if (existing) {
          return existing;
        }

        const service = draft.services.find((s) => s.id === input.serviceId && s.active);
        if (!service) {
          throw new Error('SERVICE_UNAVAILABLE');
        }

        const area = draft.serviceAreas.find(
          (a) => a.id === input.address.serviceAreaId && a.active,
        );
        if (!area) {
          throw new Error('AREA_UNSUPPORTED');
        }

        const slotObj = TIME_SLOTS.find((s) => s.slotId === input.slotId);
        if (!slotObj) {
          throw new Error('INVALID_SLOT');
        }

        const cleanCode = input.couponCode?.trim().toUpperCase();
        const coupon = cleanCode
          ? draft.coupons.find((c) => c.code === cleanCode && c.active)
          : undefined;

        const pricing = calculatePriceSnapshot({
          service,
          quantity: input.acDetails.quantity,
          coupon,
        });

        const destCoords = addJitter(area.center);
        const nowIso = new Date().toISOString();
        const refNum = Math.floor(4100 + Math.random() * 5800);
        const bookingId = `bk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const reference = `VC-JPR-${refNum}`;

        // Rank real available technicians atomically inside the transaction
        const ranked = findAndRankTechnicians({
          technicians: draft.technicians,
          bookings: draft.bookings,
          serviceCategory: service.category,
          acType: input.acDetails.acType,
          serviceAreaId: area.id,
          destination: destCoords,
          scheduledDate: input.scheduledDate,
          slotId: input.slotId,
        });

        const topCandidate = ranked[0];
        const initialStatus: BookingStatus = topCandidate
          ? 'ASSIGNED'
          : 'ASSIGNMENT_PENDING';

        const events: Booking['events'] = [
          {
            id: `ev-${Date.now()}-1`,
            status: 'CONFIRMED',
            title:
              input.paymentMethod === 'PAY_AFTER_SERVICE'
                ? 'Booking confirmed (Pay After Service)'
                : `Booking confirmed & paid via ${input.paymentMethod}`,
            description: `Total payable ₹${pricing.totalPayableInr} (incl. ${pricing.gstRatePct}% GST).`,
            actorRole: 'CUSTOMER',
            actorName: input.address.customerName,
            timestamp: nowIso,
          },
        ];

        let tracking: Booking['tracking'] = undefined;
        const offeredTechnicianIds: string[] = [];

        if (topCandidate) {
          offeredTechnicianIds.push(topCandidate.technician.id);
          const waypoints = generateRouteWaypoints(
            topCandidate.technician.currentLocation,
            destCoords,
            14,
          );
          tracking = {
            technicianId: topCandidate.technician.id,
            currentLocation: topCandidate.technician.currentLocation,
            destinationLocation: destCoords,
            routeWaypoints: waypoints,
            routeProgressPct: 0,
            distanceRemainingKm: topCandidate.distanceKm,
            etaMinutes: Math.max(8, Math.round(topCandidate.distanceKm * 3.8)),
            speedKmh: 24,
            autoDriving: false,
            lastUpdatedAt: nowIso,
          };
          events.push({
            id: `ev-${Date.now()}-2`,
            status: 'ASSIGNED',
            title: `Technician ${topCandidate.technician.name} assigned`,
            description: `Matched via dispatch engine (${topCandidate.distanceKm} km away, rating ${topCandidate.technician.rating}/5).`,
            actorRole: 'SYSTEM',
            actorName: 'VayuCare Dispatch',
            timestamp: nowIso,
          });
        } else {
          events.push({
            id: `ev-${Date.now()}-2`,
            status: 'ASSIGNMENT_PENDING',
            title: 'Searching for available verified technician',
            description:
              'Your booking is confirmed. Operations dispatch is allocating the nearest specialist.',
            actorRole: 'SYSTEM',
            actorName: 'VayuCare Dispatch',
            timestamp: nowIso,
          });
        }

        const newBooking: Booking = {
          id: bookingId,
          reference,
          idempotencyKey: input.idempotencyKey,
          serviceId: service.id,
          serviceSlug: service.slug,
          serviceName: service.name,
          serviceCategory: service.category,
          status: initialStatus,
          acDetails: input.acDetails,
          address: {
            ...input.address,
            city: area.city,
            state: area.state,
            locality: area.locality,
            coordinates: destCoords,
          },
          scheduledDate: input.scheduledDate,
          slotId: slotObj.slotId,
          slotLabel: slotObj.label,
          pricing,
          paymentMethod: input.paymentMethod,
          paymentStatus:
            input.paymentMethod === 'PAY_AFTER_SERVICE' ? 'PAY_ON_COMPLETION' : 'PAID',
          transactionRef:
            input.paymentMethod === 'PAY_AFTER_SERVICE'
              ? undefined
              : `${input.paymentMethod}-JPR-${Math.floor(10000000 + Math.random() * 89999999)}`,
          assignedTechnicianId: topCandidate?.technician.id,
          offeredTechnicianIds,
          rejectedTechnicianIds: [],
          tracking,
          events,
          messages: [
            {
              id: `msg-${Date.now()}`,
              bookingId,
              senderRole: 'SYSTEM',
              senderName: 'VayuCare Dispatch',
              text: topCandidate
                ? `${topCandidate.technician.name} has been assigned for ${slotObj.label} in ${area.locality}. You can track arrival or message here.`
                : `Booking ${reference} confirmed. Dispatch team is assigning your technician shortly.`,
              timestamp: nowIso,
            },
          ],
          createdAt: nowIso,
          updatedAt: nowIso,
          assignedAt: topCandidate ? nowIso : undefined,
        };

        draft.bookings.unshift(newBooking);
        db.addAuditLog({
          actorRole: 'SYSTEM',
          actorName: 'Booking Engine',
          action: 'BOOKING_CREATED',
          entityType: 'BOOKING',
          entityId: bookingId,
          summary: `${reference} created for ${service.name} in ${area.locality} (₹${pricing.totalPayableInr})`,
        });

        return newBooking;
      });

      const enriched = enrichBooking(createdBooking);
      realtimeHub.broadcastGlobal({
        type: 'booking:created',
        payload: { booking: enriched },
      });
      res.status(201).json({ booking: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'UNKNOWN';
      if (msg === 'AREA_UNSUPPORTED') {
        res.status(400).json({ error: 'Selected locality is not active for bookings.' });
        return;
      }
      if (msg === 'SERVICE_UNAVAILABLE') {
        res.status(400).json({ error: 'Selected service package is unavailable.' });
        return;
      }
      res.status(500).json({ error: 'Failed to create booking.' });
    }
  });

  app.post('/api/bookings/:id/cancel', requireAuth(['CUSTOMER', 'ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'Cancelled by customer';

    try {
      const updated = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === id);
        if (!booking) throw new Error('NOT_FOUND');
        if (!VALID_STATE_TRANSITIONS[booking.status].includes('CANCELLED')) {
          throw new Error('INVALID_TRANSITION');
        }
        const nowIso = new Date().toISOString();
        booking.status = 'CANCELLED';
        if (booking.paymentStatus === 'PAID') {
          booking.paymentStatus = 'REFUNDED';
        }
        booking.updatedAt = nowIso;
        booking.events.push({
          id: `ev-${Date.now()}`,
          status: 'CANCELLED',
          title: 'Booking cancelled',
          description: reason,
          actorRole: 'CUSTOMER',
          actorName: booking.address.customerName,
          timestamp: nowIso,
        });
        db.addAuditLog({
          actorRole: 'CUSTOMER',
          actorName: booking.address.customerName,
          action: 'BOOKING_CANCELLED',
          entityType: 'BOOKING',
          entityId: booking.id,
          summary: `${booking.reference} cancelled: ${reason}`,
        });
        return booking;
      });
      const enriched = enrichBooking(updated);
      realtimeHub.broadcastBookingUpdate(updated.id, {
        type: 'booking:updated',
        payload: { booking: enriched },
      });
      res.json({ booking: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NOT_FOUND') res.status(404).json({ error: 'Booking not found' });
      else if (msg === 'INVALID_TRANSITION') {
        res.status(409).json({ error: 'Booking cannot be cancelled in its current stage.' });
      } else res.status(500).json({ error: 'Cancel failed' });
    }
  });

  app.post('/api/bookings/:id/messages', requireAuth(['CUSTOMER', 'TECHNICIAN', 'ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const schema = z.object({
      senderRole: z.enum(['CUSTOMER', 'TECHNICIAN']),
      senderName: z.string().min(1).max(80),
      text: z.string().min(1).max(600),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Message text is required' });
      return;
    }

    try {
      const message = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === id);
        if (!booking) throw new Error('NOT_FOUND');
        const msg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          bookingId: booking.id,
          senderRole: parsed.data.senderRole,
          senderName: parsed.data.senderName,
          text: parsed.data.text.trim(),
          timestamp: new Date().toISOString(),
        };
        booking.messages.push(msg);
        booking.updatedAt = msg.timestamp;
        return msg;
      });
      realtimeHub.broadcastBookingUpdate(id, {
        type: 'chat:message',
        payload: { bookingId: id, message },
      });
      res.status(201).json({ message });
    } catch {
      res.status(404).json({ error: 'Booking not found' });
    }
  });

  app.post('/api/bookings/:id/quote/respond', requireAuth(['CUSTOMER', 'ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const schema = z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      customerNote: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid quote decision' });
      return;
    }

    try {
      const updated = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === id);
        if (!booking || !booking.quote) throw new Error('QUOTE_NOT_FOUND');
        if (booking.quote.status !== 'PENDING') throw new Error('ALREADY_DECIDED');

        const nowIso = new Date().toISOString();
        booking.quote.status = parsed.data.decision;
        booking.quote.customerNote = parsed.data.customerNote;
        booking.quote.respondedAt = nowIso;

        const service = draft.services.find((s) => s.id === booking.serviceId);
        if (parsed.data.decision === 'APPROVED') {
          booking.status = 'QUOTE_APPROVED';
          if (service) {
            booking.pricing = calculatePriceSnapshot({
              service,
              quantity: booking.acDetails.quantity,
              approvedQuote: booking.quote,
            });
          }
          booking.events.push({
            id: `ev-${Date.now()}`,
            status: 'QUOTE_APPROVED',
            title: `Customer approved repair estimate (₹${booking.quote.totalInr})`,
            description:
              parsed.data.customerNote ||
              'Technician authorized to install quoted spare parts.',
            actorRole: 'CUSTOMER',
            actorName: booking.address.customerName,
            timestamp: nowIso,
          });
        } else {
          booking.status = 'INSPECTION_IN_PROGRESS';
          booking.events.push({
            id: `ev-${Date.now()}`,
            status: 'INSPECTION_IN_PROGRESS',
            title: 'Customer declined repair estimate',
            description:
              parsed.data.customerNote ||
              'No extra paid parts approved; technician may submit revised estimate or complete inspection.',
            actorRole: 'CUSTOMER',
            actorName: booking.address.customerName,
            timestamp: nowIso,
          });
        }
        booking.updatedAt = nowIso;
        db.addAuditLog({
          actorRole: 'CUSTOMER',
          actorName: booking.address.customerName,
          action: `QUOTE_${parsed.data.decision}`,
          entityType: 'QUOTE',
          entityId: booking.quote.id,
          summary: `${booking.reference} repair quote ${parsed.data.decision.toLowerCase()} (₹${booking.quote.totalInr})`,
        });
        return booking;
      });

      const enriched = enrichBooking(updated);
      realtimeHub.broadcastBookingUpdate(id, {
        type: 'booking:updated',
        payload: { booking: enriched },
      });
      res.json({ booking: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'QUOTE_NOT_FOUND') res.status(404).json({ error: 'Quote not found' });
      else if (msg === 'ALREADY_DECIDED') {
        res.status(409).json({ error: 'This repair quote has already been responded to.' });
      } else res.status(500).json({ error: 'Failed to respond to quote' });
    }
  });

  app.post('/api/bookings/:id/review', requireAuth(['CUSTOMER']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const schema = z.object({
      rating: z.number().int().min(1).max(5),
      serviceQualityRating: z.number().int().min(1).max(5),
      punctualityRating: z.number().int().min(1).max(5),
      comment: z.string().min(5).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide ratings (1-5) and a short review.' });
      return;
    }

    try {
      const updated = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === id);
        if (!booking) throw new Error('NOT_FOUND');
        if (booking.status !== 'COMPLETED') throw new Error('NOT_COMPLETED');
        if (booking.review) throw new Error('DUPLICATE_REVIEW');

        booking.review = {
          id: `rev-${Date.now()}`,
          ...parsed.data,
          customerName: booking.address.customerName,
          locality: `${booking.address.locality}, ${booking.address.city}`,
          createdAt: new Date().toISOString(),
        };

        if (booking.assignedTechnicianId) {
          const tech = draft.technicians.find((t) => t.id === booking.assignedTechnicianId);
          if (tech) {
            const total = tech.rating * Math.max(1, tech.completedJobsCount);
            tech.rating = Number(
              ((total + parsed.data.rating) / (tech.completedJobsCount + 1)).toFixed(2),
            );
          }
        }
        return booking;
      });
      const enriched = enrichBooking(updated);
      realtimeHub.broadcastBookingUpdate(id, {
        type: 'booking:updated',
        payload: { booking: enriched },
      });
      res.status(201).json({ booking: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NOT_COMPLETED') {
        res.status(409).json({ error: 'Reviews can only be submitted after job completion.' });
      } else if (msg === 'DUPLICATE_REVIEW') {
        res.status(409).json({ error: 'A review has already been submitted for this booking.' });
      } else res.status(404).json({ error: 'Booking not found' });
    }
  });

  app.post('/api/bookings/:id/complaint', requireAuth(['CUSTOMER']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const schema = z.object({
      category: z.enum(['COOLING_ISSUE', 'WARRANTY_REVISIT', 'BILLING', 'BEHAVIOUR']),
      description: z.string().min(8).max(600),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please describe the issue (at least 8 characters).' });
      return;
    }

    try {
      const complaint = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === id);
        if (!booking) throw new Error('NOT_FOUND');

        const ticket = {
          id: `CMP-${Math.floor(1000 + Math.random() * 8999)}`,
          bookingId: booking.id,
          bookingReference: booking.reference,
          customerName: booking.address.customerName,
          category: parsed.data.category,
          description: parsed.data.description,
          status: 'OPEN' as const,
          createdAt: new Date().toISOString(),
        };
        draft.complaints.unshift(ticket);
        db.addAuditLog({
          actorRole: 'CUSTOMER',
          actorName: booking.address.customerName,
          action: 'COMPLAINT_RAISED',
          entityType: 'COMPLAINT',
          entityId: ticket.id,
          summary: `${ticket.id} raised on ${booking.reference} (${parsed.data.category})`,
        });
        return ticket;
      });
      realtimeHub.broadcastGlobal({
        type: 'ops:refresh',
        payload: { reason: 'complaint_created' },
      });
      res.status(201).json({ complaint });
    } catch {
      res.status(404).json({ error: 'Booking not found' });
    }
  });

  // --- TECHNICIAN PORTAL APIs ---

  app.get('/api/technician/portal', requireAuth(['TECHNICIAN']), (req: AuthenticatedRequest, res: Response) => {
    const state = db.read();
    const techId = req.authUser?.technicianId;
    const activeTech = state.technicians.find((t) => t.id === techId);
    if (!activeTech) {
      res.status(404).json({ error: 'Technician profile not found' });
      return;
    }

    const jobs = state.bookings
      .filter((b) => b.assignedTechnicianId === activeTech.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(enrichBooking);

    res.json({
      activeTechnician: activeTech,
      jobs,
      serviceAreas: state.serviceAreas,
    });
  });

  app.post('/api/technician/register', async (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(2).max(80),
      phone: z.string().min(8).max(20),
      baseLocality: z.string().min(2).max(80),
      serviceAreaIds: z.array(z.string()).min(1),
      skills: z.array(z.enum(['SERVICING', 'REPAIR', 'GAS_REFILL', 'INSTALLATION', 'AMC'])).min(1),
      supportedAcTypes: z.array(z.enum(['SPLIT', 'WINDOW', 'CASSETTE'])).min(1),
      experienceYears: z.number().int().min(1).max(40),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid onboarding submission' });
      return;
    }

    const tech = await db.mutate((draft) => {
      const area = draft.serviceAreas.find((a) => a.id === parsed.data.serviceAreaIds[0]);
      const created = {
        id: `tech-${Date.now()}`,
        name: parsed.data.name,
        phone: parsed.data.phone,
        city: area?.city ?? 'Jaipur',
        baseLocality: parsed.data.baseLocality,
        serviceAreaIds: parsed.data.serviceAreaIds,
        skills: parsed.data.skills,
        supportedAcTypes: parsed.data.supportedAcTypes,
        experienceYears: parsed.data.experienceYears,
        verificationStatus: 'PENDING' as const,
        online: false,
        rating: 0,
        completedJobsCount: 0,
        acceptanceRate: 100,
        onTimeRate: 100,
        currentLocation: area?.center ?? { lat: 26.9124, lng: 75.7873 },
        earningsInr: 0,
        documentsSubmitted: ['Aadhaar KYC', 'Trade Skill Declaration (Pending Admin Review)'],
      };
      draft.technicians.push(created);
      db.addAuditLog({
        actorRole: 'TECHNICIAN',
        actorName: created.name,
        action: 'TECH_ONBOARDING_SUBMITTED',
        entityType: 'TECHNICIAN',
        entityId: created.id,
        summary: `${created.name} applied for ${created.baseLocality} (awaiting verification)`,
      });
      return created;
    });

    realtimeHub.broadcastGlobal({
      type: 'technician:status',
      payload: { technician: tech },
    });
    res.status(201).json({ technician: tech });
  });

  app.post('/api/technician/:id/toggle-online', requireAuth(['TECHNICIAN']), async (req: AuthenticatedRequest, res: Response) => {
    const id = getParam(req, 'id');
    if (req.authUser?.technicianId !== id) {
      res.status(403).json({ error: 'Cannot modify another technician availability.' });
      return;
    }
    try {
      const tech = await db.mutate((draft) => {
        const found = draft.technicians.find((t) => t.id === id);
        if (!found) throw new Error('NOT_FOUND');
        if (found.verificationStatus !== 'APPROVED') throw new Error('NOT_VERIFIED');
        found.online = !found.online;
        db.addAuditLog({
          actorRole: 'TECHNICIAN',
          actorName: found.name,
          action: found.online ? 'TECH_ONLINE' : 'TECH_OFFLINE',
          entityType: 'TECHNICIAN',
          entityId: found.id,
          summary: `${found.name} switched status to ${found.online ? 'Online' : 'Offline'}`,
        });
        return found;
      });
      realtimeHub.broadcastGlobal({
        type: 'technician:status',
        payload: { technician: tech },
      });
      res.json({ technician: tech });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NOT_VERIFIED') {
        res.status(403).json({
          error: 'Technician must be approved by Admin before going online.',
        });
      } else {
        res.status(404).json({ error: 'Technician not found' });
      }
    }
  });

  app.post('/api/technician/jobs/:bookingId/reject', requireAuth(['TECHNICIAN']), async (req: AuthenticatedRequest, res: Response) => {
    const bookingId = getParam(req, 'bookingId');
    const technicianId = req.authUser?.technicianId ?? '';

    try {
      const updated = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === bookingId);
        if (!booking) throw new Error('NOT_FOUND');
        if (booking.assignedTechnicianId !== technicianId) throw new Error('FORBIDDEN');

        const rejecter = draft.technicians.find((t) => t.id === technicianId);
        booking.rejectedTechnicianIds.push(technicianId);
        if (rejecter) {
          rejecter.acceptanceRate = Math.max(65, rejecter.acceptanceRate - 3);
        }

        const nextRanked = findAndRankTechnicians({
          technicians: draft.technicians,
          bookings: draft.bookings,
          serviceCategory: booking.serviceCategory,
          acType: booking.acDetails.acType,
          serviceAreaId: booking.address.serviceAreaId,
          destination: booking.address.coordinates,
          scheduledDate: booking.scheduledDate,
          slotId: booking.slotId,
          excludeTechnicianIds: booking.rejectedTechnicianIds,
        });

        const nowIso = new Date().toISOString();
        const nextTech = nextRanked[0];

        if (nextTech) {
          booking.assignedTechnicianId = nextTech.technician.id;
          booking.offeredTechnicianIds.push(nextTech.technician.id);
          booking.status = 'ASSIGNED';
          booking.tracking = {
            technicianId: nextTech.technician.id,
            currentLocation: nextTech.technician.currentLocation,
            destinationLocation: booking.address.coordinates,
            routeWaypoints: generateRouteWaypoints(
              nextTech.technician.currentLocation,
              booking.address.coordinates,
              14,
            ),
            routeProgressPct: 0,
            distanceRemainingKm: nextTech.distanceKm,
            etaMinutes: Math.max(8, Math.round(nextTech.distanceKm * 3.8)),
            speedKmh: 24,
            autoDriving: false,
            lastUpdatedAt: nowIso,
          };
          booking.events.push({
            id: `ev-${Date.now()}`,
            status: 'ASSIGNED',
            title: `Reassigned to ${nextTech.technician.name}`,
            description: `Previous technician unavailable; auto-dispatched to next specialist (${nextTech.distanceKm} km away).`,
            actorRole: 'SYSTEM',
            actorName: 'Dispatch Engine',
            timestamp: nowIso,
          });
        } else {
          booking.assignedTechnicianId = undefined;
          booking.tracking = undefined;
          booking.status = 'ASSIGNMENT_PENDING';
          booking.events.push({
            id: `ev-${Date.now()}`,
            status: 'ASSIGNMENT_PENDING',
            title: 'Escalated to Operations Dispatch',
            description: 'No backup technician immediately matched; Admin notified.',
            actorRole: 'SYSTEM',
            actorName: 'Dispatch Engine',
            timestamp: nowIso,
          });
        }

        booking.updatedAt = nowIso;
        return booking;
      });
      const enriched = enrichBooking(updated);
      realtimeHub.broadcastBookingUpdate(bookingId, {
        type: 'booking:updated',
        payload: { booking: enriched },
      });
      res.json({ booking: enriched });
    } catch {
      res.status(400).json({ error: 'Unable to reject assignment.' });
    }
  });

  app.post('/api/technician/jobs/:bookingId/advance', requireAuth(['TECHNICIAN']), async (req: AuthenticatedRequest, res: Response) => {
    const bookingId = getParam(req, 'bookingId');
    const schema = z.object({
      technicianId: z.string().min(1).optional(),
      nextStatus: z.enum([
        'TECHNICIAN_EN_ROUTE',
        'TECHNICIAN_ARRIVED',
        'INSPECTION_IN_PROGRESS',
        'SERVICE_IN_PROGRESS',
        'COMPLETED',
      ]),
      notes: z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status transition payload' });
      return;
    }

    try {
      const updated = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === bookingId);
        if (!booking) throw new Error('NOT_FOUND');
        const authTechId = req.authUser?.technicianId ?? '';
        if (booking.assignedTechnicianId !== authTechId) {
          throw new Error('FORBIDDEN');
        }
        const { nextStatus, notes } = parsed.data;
        if (!VALID_STATE_TRANSITIONS[booking.status].includes(nextStatus)) {
          throw new Error(`INVALID_TRANSITION:${booking.status}->${nextStatus}`);
        }

        const tech = draft.technicians.find((t) => t.id === authTechId);
        const nowIso = new Date().toISOString();
        booking.status = nextStatus;
        booking.updatedAt = nowIso;

        if (nextStatus === 'TECHNICIAN_EN_ROUTE' && booking.tracking) {
          booking.tracking.lastUpdatedAt = nowIso;
        }

        if (nextStatus === 'TECHNICIAN_ARRIVED' && booking.tracking) {
          booking.tracking.autoDriving = false;
          booking.tracking.currentLocation = booking.tracking.destinationLocation;
          booking.tracking.routeProgressPct = 100;
          booking.tracking.distanceRemainingKm = 0;
          booking.tracking.etaMinutes = 0;
          booking.tracking.lastUpdatedAt = nowIso;
          if (tech) tech.currentLocation = booking.tracking.destinationLocation;
        }

        if (nextStatus === 'INSPECTION_IN_PROGRESS' && notes) {
          booking.inspectionNotes = notes;
        }

        if (nextStatus === 'COMPLETED') {
          booking.completedAt = nowIso;
          booking.paymentStatus = 'PAID';
          if (notes) booking.completionNotes = notes;
          if (tech) {
            tech.completedJobsCount += 1;
            const netShare = Math.round(booking.pricing.grandTotalInr * 0.78);
            tech.earningsInr += netShare;
          }
        }

        const labelMap: Record<string, { title: string; desc: string }> = {
          TECHNICIAN_EN_ROUTE: {
            title: 'Technician is on the way',
            desc: `${tech?.name ?? 'Technician'} started navigation to ${booking.address.locality}.`,
          },
          TECHNICIAN_ARRIVED: {
            title: 'Technician arrived at doorstep',
            desc: `Arrived at ${booking.address.houseNo}, ${booking.address.locality}.`,
          },
          INSPECTION_IN_PROGRESS: {
            title: 'AC inspection started',
            desc: notes || 'Checking cooling pressure, coil condition, and electrical load.',
          },
          SERVICE_IN_PROGRESS: {
            title: 'AC service & repair in progress',
            desc: notes || 'Active servicing / repair execution underway.',
          },
          COMPLETED: {
            title: 'Service completed & verified',
            desc: notes || 'Testing passed. Digital invoice & warranty record generated.',
          },
        };

        booking.events.push({
          id: `ev-${Date.now()}`,
          status: nextStatus,
          title: labelMap[nextStatus].title,
          description: labelMap[nextStatus].desc,
          actorRole: 'TECHNICIAN',
          actorName: tech?.name ?? 'Technician',
          timestamp: nowIso,
        });

        db.addAuditLog({
          actorRole: 'TECHNICIAN',
          actorName: tech?.name ?? 'Technician',
          action: `JOB_${nextStatus}`,
          entityType: 'BOOKING',
          entityId: booking.id,
          summary: `${booking.reference} moved to ${nextStatus}`,
        });

        return booking;
      });

      const enriched = enrichBooking(updated);
      realtimeHub.broadcastBookingUpdate(bookingId, {
        type: 'booking:updated',
        payload: { booking: enriched },
      });
      res.json({ booking: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('INVALID_TRANSITION')) {
        res.status(409).json({ error: `Transition not allowed (${msg}).` });
      } else if (msg === 'FORBIDDEN') {
        res.status(403).json({ error: 'Only the assigned technician can update this job.' });
      } else {
        res.status(404).json({ error: 'Booking not found' });
      }
    }
  });

  app.post('/api/technician/jobs/:bookingId/location', requireAuth(['TECHNICIAN']), async (req: AuthenticatedRequest, res: Response) => {
    const bookingId = getParam(req, 'bookingId');
    const schema = z.object({
      technicianId: z.string().min(1).optional(),
      stepForward: z.boolean().optional(),
      progressPct: z.number().min(0).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid location update' });
      return;
    }

    try {
      const authTechId = req.authUser?.technicianId ?? '';
      const result = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === bookingId);
        if (!booking || !booking.tracking) throw new Error('TRACKING_UNAVAILABLE');
        if (booking.assignedTechnicianId !== authTechId) {
          throw new Error('FORBIDDEN');
        }
        const waypoints = booking.tracking.routeWaypoints;
        const maxIdx = waypoints.length - 1;
        let nextIdx = Math.round((booking.tracking.routeProgressPct / 100) * maxIdx);
        if (parsed.data.stepForward) {
          nextIdx = Math.min(maxIdx, nextIdx + 1);
        } else if (typeof parsed.data.progressPct === 'number') {
          nextIdx = Math.min(maxIdx, Math.max(0, Math.round((parsed.data.progressPct / 100) * maxIdx)));
        }

        const nextLoc = waypoints[nextIdx];
        const dist = haversineDistanceKm(nextLoc, booking.tracking.destinationLocation);
        const pct = Math.round((nextIdx / maxIdx) * 100);
        const nowIso = new Date().toISOString();

        booking.tracking.currentLocation = nextLoc;
        booking.tracking.routeProgressPct = pct;
        booking.tracking.distanceRemainingKm = dist;
        booking.tracking.etaMinutes = pct >= 100 ? 0 : Math.max(1, Math.round(dist * 3.8));
        booking.tracking.lastUpdatedAt = nowIso;

        const tech = draft.technicians.find((t) => t.id === authTechId);
        if (tech) tech.currentLocation = nextLoc;

        return booking;
      });

      if (result.tracking) {
        realtimeHub.broadcastBookingUpdate(bookingId, {
          type: 'technician:location',
          payload: { bookingId, tracking: result.tracking },
        });
      }
      res.json({ booking: enrichBooking(result) });
    } catch {
      res.status(400).json({ error: 'Could not update live coordinates' });
    }
  });

  app.post('/api/technician/jobs/:bookingId/auto-drive', requireAuth(['TECHNICIAN']), async (req: AuthenticatedRequest, res: Response) => {
    const bookingId = getParam(req, 'bookingId');
    const enabled = Boolean(req.body?.enabled);
    const technicianId = req.authUser?.technicianId ?? '';

    const state = db.read();
    const booking = state.bookings.find((b) => b.id === bookingId);
    if (!booking || !booking.tracking || booking.assignedTechnicianId !== technicianId) {
      res.status(404).json({ error: 'Active tracking job not found for technician' });
      return;
    }


    await db.mutate((draft) => {
      const b = draft.bookings.find((item) => item.id === bookingId);
      if (b?.tracking) {
        b.tracking.autoDriving = enabled;
      }
    });


    const refreshed = db.read().bookings.find((b) => b.id === bookingId)!;
    if (refreshed.tracking) {
      realtimeHub.broadcastBookingUpdate(bookingId, {
        type: 'technician:location',
        payload: { bookingId, tracking: refreshed.tracking },
      });
    }
    res.json({ booking: enrichBooking(refreshed) });
  });

  app.post('/api/technician/jobs/:bookingId/quote', requireAuth(['TECHNICIAN']), async (req: AuthenticatedRequest, res: Response) => {
    const bookingId = getParam(req, 'bookingId');
    const parsed = quoteSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid repair quote format' });
      return;
    }

    try {
      const authTechId = req.authUser?.technicianId ?? '';
      const updated = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === bookingId);
        if (!booking) throw new Error('NOT_FOUND');
        if (booking.assignedTechnicianId !== authTechId) {
          throw new Error('FORBIDDEN');
        }
        if (
          !['TECHNICIAN_ARRIVED', 'INSPECTION_IN_PROGRESS', 'QUOTE_PENDING'].includes(
            booking.status,
          )
        ) {
          throw new Error('INVALID_STAGE');
        }

        const totals = calculateQuoteTotals(parsed.data.items);
        const nowIso = new Date().toISOString();
        const quote: RepairQuote = {
          id: `qt-${Date.now()}`,
          bookingId: booking.id,
          technicianId: authTechId,
          diagnosis: parsed.data.diagnosis,
          estimatedExtraMins: parsed.data.estimatedExtraMins,
          items: parsed.data.items.map((item, idx) => ({
            id: `qi-${idx + 1}`,
            ...item,
          })),
          ...totals,
          status: 'PENDING',
          submittedAt: nowIso,
        };

        booking.quote = quote;
        booking.status = 'QUOTE_PENDING';
        booking.updatedAt = nowIso;
        booking.events.push({
          id: `ev-${Date.now()}`,
          status: 'QUOTE_PENDING',
          title: `Repair estimate submitted (₹${totals.totalInr})`,
          description: `Awaiting customer approval for ${parsed.data.items.length} line item(s).`,
          actorRole: 'TECHNICIAN',
          actorName:
            draft.technicians.find((t) => t.id === parsed.data.technicianId)?.name ??
            'Technician',
          timestamp: nowIso,
        });

        db.addAuditLog({
          actorRole: 'TECHNICIAN',
          actorName: 'Technician Quote',
          action: 'QUOTE_SUBMITTED',
          entityType: 'QUOTE',
          entityId: quote.id,
          summary: `${booking.reference} repair quote ₹${totals.totalInr} awaiting customer approval`,
        });

        return booking;
      });

      const enriched = enrichBooking(updated);
      realtimeHub.broadcastBookingUpdate(bookingId, {
        type: 'booking:updated',
        payload: { booking: enriched },
      });
      res.status(201).json({ booking: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_STAGE') {
        res.status(409).json({
          error: 'Technician must mark Arrived or Inspection Started before submitting a quote.',
        });
      } else {
        res.status(400).json({ error: 'Unable to submit repair quote' });
      }
    }
  });

  // --- ADMIN OPS APIs ---

  app.get('/api/admin/overview', requireAuth(['ADMIN']), (_req: Request, res: Response) => {
    const state = db.read();
    res.json({
      stats: db.getAdminOverviewStats(),
      bookings: [...state.bookings]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(enrichBooking),
      technicians: state.technicians,
      services: state.services,
      serviceAreas: state.serviceAreas,
      complaints: state.complaints,
      auditLogs: state.auditLogs,
    });
  });

  app.post('/api/admin/bookings/:id/assign', requireAuth(['ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const technicianId = typeof req.body?.technicianId === 'string' ? req.body.technicianId : '';

    try {
      const updated = await db.mutate((draft) => {
        const booking = draft.bookings.find((b) => b.id === id);
        const tech = draft.technicians.find((t) => t.id === technicianId);
        if (!booking || !tech) throw new Error('NOT_FOUND');
        if (tech.verificationStatus !== 'APPROVED') throw new Error('UNVERIFIED_TECH');

        const nowIso = new Date().toISOString();
        const dist = haversineDistanceKm(tech.currentLocation, booking.address.coordinates);
        booking.assignedTechnicianId = tech.id;
        if (!booking.offeredTechnicianIds.includes(tech.id)) {
          booking.offeredTechnicianIds.push(tech.id);
        }
        booking.status = 'ASSIGNED';
        booking.assignedAt = nowIso;
        booking.updatedAt = nowIso;
        booking.tracking = {
          technicianId: tech.id,
          currentLocation: tech.currentLocation,
          destinationLocation: booking.address.coordinates,
          routeWaypoints: generateRouteWaypoints(
            tech.currentLocation,
            booking.address.coordinates,
            14,
          ),
          routeProgressPct: 0,
          distanceRemainingKm: dist,
          etaMinutes: Math.max(8, Math.round(dist * 3.8)),
          speedKmh: 24,
          autoDriving: false,
          lastUpdatedAt: nowIso,
        };
        booking.events.push({
          id: `ev-${Date.now()}`,
          status: 'ASSIGNED',
          title: `Admin assigned ${tech.name}`,
          description: `Manual operations dispatch (${dist} km away).`,
          actorRole: 'ADMIN',
          actorName: 'Operations Desk',
          timestamp: nowIso,
        });

        db.addAuditLog({
          actorRole: 'ADMIN',
          actorName: 'Operations Desk',
          action: 'MANUAL_TECH_ASSIGN',
          entityType: 'BOOKING',
          entityId: booking.id,
          summary: `Assigned ${tech.name} to ${booking.reference}`,
        });
        return booking;
      });
      const enriched = enrichBooking(updated);
      realtimeHub.broadcastBookingUpdate(id, {
        type: 'booking:updated',
        payload: { booking: enriched },
      });
      res.json({ booking: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'UNVERIFIED_TECH') {
        res.status(400).json({ error: 'Cannot assign an unverified technician.' });
      } else {
        res.status(404).json({ error: 'Booking or technician not found' });
      }
    }
  });

  app.post('/api/admin/technicians/:id/verify', requireAuth(['ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const schema = z.object({
      status: z.enum(['APPROVED', 'SUSPENDED', 'PENDING']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid verification status' });
      return;
    }

    try {
      const tech = await db.mutate((draft) => {
        const found = draft.technicians.find((t) => t.id === id);
        if (!found) throw new Error('NOT_FOUND');
        found.verificationStatus = parsed.data.status;
        if (parsed.data.status !== 'APPROVED') {
          found.online = false;
        } else {
          found.online = true;
        }
        db.addAuditLog({
          actorRole: 'ADMIN',
          actorName: 'Operations Desk',
          action: `TECH_VERIFICATION_${parsed.data.status}`,
          entityType: 'TECHNICIAN',
          entityId: found.id,
          summary: `${found.name} verification set to ${parsed.data.status}`,
        });
        return found;
      });
      realtimeHub.broadcastGlobal({
        type: 'technician:status',
        payload: { technician: tech },
      });
      res.json({ technician: tech });
    } catch {
      res.status(404).json({ error: 'Technician not found' });
    }
  });

  app.post('/api/admin/services/:id', requireAuth(['ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const schema = z.object({
      basePriceInr: z.number().min(99).max(50000).optional(),
      active: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid service update' });
      return;
    }

    try {
      const service = await db.mutate((draft) => {
        const found = draft.services.find((s) => s.id === id);
        if (!found) throw new Error('NOT_FOUND');
        const oldPrice = found.basePriceInr;
        if (typeof parsed.data.basePriceInr === 'number' && parsed.data.basePriceInr !== oldPrice) {
          found.basePriceInr = Math.round(parsed.data.basePriceInr);
          found.priceVersion += 1;
          db.addAuditLog({
            actorRole: 'ADMIN',
            actorName: 'Pricing Admin',
            action: 'SERVICE_PRICE_VERSIONED',
            entityType: 'SERVICE',
            entityId: found.id,
            summary: `${found.name} price updated ₹${oldPrice} → ₹${found.basePriceInr} (v${found.priceVersion})`,
          });
        }
        if (typeof parsed.data.active === 'boolean') {
          found.active = parsed.data.active;
          db.addAuditLog({
            actorRole: 'ADMIN',
            actorName: 'Catalog Admin',
            action: found.active ? 'SERVICE_ENABLED' : 'SERVICE_PAUSED',
            entityType: 'SERVICE',
            entityId: found.id,
            summary: `${found.name} marked ${found.active ? 'Active' : 'Paused'}`,
          });
        }
        return found;
      });
      realtimeHub.broadcastGlobal({
        type: 'ops:refresh',
        payload: { reason: 'service_updated' },
      });
      res.json({ service });
    } catch {
      res.status(404).json({ error: 'Service not found' });
    }
  });

  app.post('/api/admin/service-areas/:id/toggle', requireAuth(['ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    try {
      const area = await db.mutate((draft) => {
        const found = draft.serviceAreas.find((a) => a.id === id);
        if (!found) throw new Error('NOT_FOUND');
        found.active = !found.active;
        db.addAuditLog({
          actorRole: 'ADMIN',
          actorName: 'City Ops',
          action: found.active ? 'AREA_ACTIVATED' : 'AREA_DEACTIVATED',
          entityType: 'SERVICE_AREA',
          entityId: found.id,
          summary: `${found.locality}, ${found.city} (${found.pinCode}) ${found.active ? 'activated' : 'deactivated'}`,
        });
        return found;
      });
      realtimeHub.broadcastGlobal({
        type: 'ops:refresh',
        payload: { reason: 'area_toggled' },
      });
      res.json({ serviceArea: area });
    } catch {
      res.status(404).json({ error: 'Service area not found' });
    }
  });

  app.post('/api/admin/complaints/:id/resolve', requireAuth(['ADMIN']), async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const resolutionNote =
      typeof req.body?.resolutionNote === 'string' && req.body.resolutionNote.trim().length > 2
        ? req.body.resolutionNote.trim()
        : 'Warranty revisit / resolution approved by Operations Desk.';

    try {
      const complaint = await db.mutate((draft) => {
        const found = draft.complaints.find((c) => c.id === id);
        if (!found) throw new Error('NOT_FOUND');
        found.status = 'RESOLVED';
        found.resolutionNote = resolutionNote;
        found.resolvedAt = new Date().toISOString();
        db.addAuditLog({
          actorRole: 'ADMIN',
          actorName: 'Support Lead',
          action: 'COMPLAINT_RESOLVED',
          entityType: 'COMPLAINT',
          entityId: found.id,
          summary: `${found.id} resolved: ${resolutionNote}`,
        });
        return found;
      });
      realtimeHub.broadcastGlobal({
        type: 'ops:refresh',
        payload: { reason: 'complaint_resolved' },
      });
      res.json({ complaint });
    } catch {
      res.status(404).json({ error: 'Complaint not found' });
    }
  });
}
