import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Phone,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { WSEvent } from '../../shared/types';
import {
  api,
  type EnrichedBooking,
  formatInr,
  formatIstTime,
} from '../lib/api';
import { useRealtimeRoom } from '../lib/wsClient';
import { JaipurLiveMap } from './JaipurLiveMap';

interface TrackingViewProps {
  initialBookingRef?: string;
  listMode?: boolean;
  onBookNew?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Pending Payment',
  CONFIRMED: 'Booking Confirmed',
  ASSIGNMENT_PENDING: 'Finding Technician',
  ASSIGNED: 'Technician Assigned',
  TECHNICIAN_EN_ROUTE: 'Technician On The Way',
  TECHNICIAN_ARRIVED: 'Technician Arrived',
  INSPECTION_IN_PROGRESS: 'Inspection In Progress',
  QUOTE_PENDING: 'Repair Estimate Awaiting Approval',
  QUOTE_APPROVED: 'Estimate Approved',
  SERVICE_IN_PROGRESS: 'Service In Progress',
  COMPLETED: 'Service Completed',
  CANCELLED: 'Cancelled',
};

export function TrackingView({
  initialBookingRef,
  listMode = false,
  onBookNew,
}: TrackingViewProps) {
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [booking, setBooking] = useState<EnrichedBooking | null>(null);
  const [searchRef, setSearchRef] = useState(initialBookingRef ?? '');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Chat
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  // Quote Response
  const [quoteNote, setQuoteNote] = useState('');
  const [respondingQuote, setRespondingQuote] = useState(false);

  // Review
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Complaint Modal
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintCat, setComplaintCat] = useState<
    'COOLING_ISSUE' | 'WARRANTY_REVISIT' | 'BILLING' | 'BEHAVIOUR'
  >('WARRANTY_REVISIT');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [complaintSuccess, setComplaintSuccess] = useState<string | null>(null);

  // Invoice Modal
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const listRes = await api.listBookings();
      setBookings(listRes.bookings);
      if (initialBookingRef) {
        const match = listRes.bookings.find(
          (b) =>
            b.id === initialBookingRef ||
            b.reference.toLowerCase() === initialBookingRef.toLowerCase(),
        );
        if (match) {
          setSelectedId(match.id);
          setBooking(match);
          return;
        }
      }
      if (!selectedId && listRes.bookings.length > 0) {
        const liveFirst =
          listRes.bookings.find((b) => b.status === 'TECHNICIAN_EN_ROUTE') ??
          listRes.bookings[0];
        setSelectedId(liveFirst.id);
        setBooking(liveFirst);
      } else if (selectedId) {
        const current = listRes.bookings.find((b) => b.id === selectedId);
        if (current) setBooking(current);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [initialBookingRef, selectedId]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleRealtimeEvent = useCallback(
    (event: WSEvent) => {
      if (event.type === 'booking:updated') {
        const updated = event.payload.booking as EnrichedBooking;
        setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        if (selectedId === updated.id) {
          setBooking(updated);
        }
      } else if (event.type === 'booking:created') {
        const created = event.payload.booking as EnrichedBooking;
        setBookings((prev) =>
          prev.some((b) => b.id === created.id) ? prev : [created, ...prev],
        );
      } else if (event.type === 'ops:refresh') {
        void loadBookings();
      } else if (event.type === 'technician:location') {
        if (selectedId === event.payload.bookingId) {
          setBooking((prev) =>
            prev ? { ...prev, tracking: event.payload.tracking } : prev,
          );
        }
      } else if (event.type === 'chat:message') {
        if (selectedId === event.payload.bookingId) {
          setBooking((prev) => {
            if (!prev) return prev;
            if (prev.messages.some((m) => m.id === event.payload.message.id)) return prev;
            return { ...prev, messages: [...prev.messages, event.payload.message] };
          });
        }
      }
    },
    [selectedId, loadBookings],
  );

  const { connected: wsConnected } = useRealtimeRoom(
    selectedId ? `booking:${selectedId}` : null,
    handleRealtimeEvent,
  );

  async function handleSearchRef(e: React.FormEvent) {
    e.preventDefault();
    if (!searchRef.trim()) return;
    setErrorMsg(null);
    try {
      const res = await api.getBooking(searchRef.trim());
      setSelectedId(res.booking.id);
      setBooking(res.booking);
    } catch {
      setErrorMsg(`No booking found matching "${searchRef.trim()}".`);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!booking || !chatText.trim()) return;
    setSendingChat(true);
    try {
      await api.sendMessage(booking.id, {
        senderRole: 'CUSTOMER',
        senderName: booking.address.customerName,
        text: chatText.trim(),
      });
      setChatText('');
    } finally {
      setSendingChat(false);
    }
  }

  async function handleQuoteDecision(decision: 'APPROVED' | 'REJECTED') {
    if (!booking) return;
    setRespondingQuote(true);
    try {
      const res = await api.respondToQuote(booking.id, {
        decision,
        customerNote: quoteNote.trim() || undefined,
      });
      setBooking(res.booking);
      setQuoteNote('');
    } finally {
      setRespondingQuote(false);
    }
  }

  async function handleCancelBooking() {
    if (!booking) return;
    try {
      const res = await api.cancelBooking(booking.id, 'Cancelled by customer from tracking console');
      setBooking(res.booking);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to cancel booking.');
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!booking || reviewComment.trim().length < 5) return;
    setSubmittingReview(true);
    try {
      const res = await api.submitReview(booking.id, {
        rating,
        serviceQualityRating: rating,
        punctualityRating: rating,
        comment: reviewComment.trim(),
      });
      setBooking(res.booking);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleComplaintSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!booking || complaintDesc.trim().length < 8) return;
    const res = await api.raiseComplaint(booking.id, {
      category: complaintCat,
      description: complaintDesc.trim(),
    });
    setComplaintSuccess(
      `Ticket ${res.complaint.id} logged with Operations Desk. Warranty team will review shortly.`,
    );
    setComplaintDesc('');
    setComplaintOpen(false);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Lookup & Booking Selector */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            {listMode ? 'My Bookings & Invoices' : 'Live Booking & Technician Arrival'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time WebSocket tracking, repair quote approvals, and direct technician chat.
          </p>
        </div>

        <form onSubmit={handleSearchRef} className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              placeholder="Booking Ref (e.g. VC-JPR-4082)"
              className="w-60 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            Lookup
          </button>
        </form>
      </div>

      {/* Booking Switcher Strip */}
      {bookings.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {bookings.map((b) => {
            const active = booking?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSelectedId(b.id);
                  setBooking(b);
                  setComplaintSuccess(null);
                }}
                className={`rounded-lg border px-3.5 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'border-sky-700 bg-sky-50 text-sky-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="font-mono font-semibold tabular-nums">{b.reference}</div>
                <div className="mt-0.5 text-slate-500">
                  {b.address.locality} · {STATUS_LABELS[b.status] ?? b.status}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {complaintSuccess && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{complaintSuccess}</span>
          <button
            type="button"
            onClick={() => setComplaintSuccess(null)}
            className="text-xs font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && !booking ? (
        <div className="h-72 animate-pulse rounded-xl bg-slate-200" />
      ) : !booking ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-600">
            No bookings found for your account yet. Schedule a service or look up a booking
            reference above.
          </p>
          {onBookNew && (
            <button
              type="button"
              onClick={onBookNew}
              className="mt-4 rounded-lg bg-sky-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-800"
            >
              Book AC Service
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left 8 Cols: Live Map, Quote Approval, Timeline */}
          <div className="space-y-6 lg:col-span-8">
            {/* Status Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900">
                    {booking.reference}
                  </span>
                  <span>·</span>
                  <span>{booking.scheduledDate}</span>
                  <span>·</span>
                  <span className="font-mono">{booking.slotLabel}</span>
                </div>
                <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                  {STATUS_LABELS[booking.status] ?? booking.status}
                </h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  {booking.serviceName} ({booking.acDetails.quantity} × {booking.acDetails.acType}{' '}
                  {booking.acDetails.brand})
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInvoiceOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Tax Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setComplaintOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>Support / Revisit</span>
                </button>
              </div>
            </div>

            {/* Live Map */}
            {booking.status !== 'COMPLETED' && booking.status !== 'CANCELLED' && (
              <JaipurLiveMap
                tracking={booking.tracking}
                destination={booking.address.coordinates}
                localityName={`${booking.address.locality}, ${booking.address.city}`}
                technicianName={booking.assignedTechnician?.name}
                wsConnected={wsConnected}
                bookingStatus={booking.status}
              />
            )}

            {/* Customer Quote Approval Card (appears when technician submits repair quote) */}
            {booking.quote && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-amber-800">
                      Itemised Repair Estimate ·{' '}
                      {booking.quote.status === 'PENDING'
                        ? 'Awaiting Your Approval'
                        : booking.quote.status}
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold text-slate-900">
                      Technician Diagnosis &amp; Spare Parts Estimate
                    </h3>
                  </div>
                  <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatInr(booking.quote.totalInr)}
                  </div>
                </div>

                <p className="mt-2 text-sm text-slate-700">{booking.quote.diagnosis}</p>

                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Part / Repair Item</th>
                        <th className="px-3 py-2 font-semibold text-right">Qty</th>
                        <th className="px-3 py-2 font-semibold text-right">Part Cost</th>
                        <th className="px-3 py-2 font-semibold text-right">Labour</th>
                        <th className="px-3 py-2 font-semibold text-right">Warranty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {booking.quote.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-medium text-slate-900">{item.partName}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatInr(item.unitPriceInr * item.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatInr(item.labourInr)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {item.warrantyDays}d
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Estimated extra work time: {booking.quote.estimatedExtraMins} min · Includes{' '}
                    {formatInr(booking.quote.gstAmountInr)} GST
                  </span>
                </div>

                {booking.quote.status === 'PENDING' && (
                  <div className="mt-4 space-y-3 border-t border-amber-200 pt-4">
                    <input
                      type="text"
                      value={quoteNote}
                      onChange={(e) => setQuoteNote(e.target.value)}
                      placeholder="Optional note or clarification for technician..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={respondingQuote}
                        onClick={() => handleQuoteDecision('APPROVED')}
                        className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        Approve Estimate ({formatInr(booking.quote.totalInr)})
                      </button>
                      <button
                        type="button"
                        disabled={respondingQuote}
                        onClick={() => handleQuoteDecision('REJECTED')}
                        className="rounded-lg border border-rose-300 bg-white px-5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Decline Additional Work
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Post-Completion Review Form */}
            {booking.status === 'COMPLETED' && !booking.review && (
              <form
                onSubmit={handleReviewSubmit}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Rate Completed Service
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Your feedback updates technician reliability scores and appears on VayuCare.
                </p>

                <div className="mt-4 flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="rounded p-1 hover:bg-slate-100"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= rating
                            ? 'fill-amber-500 text-amber-500'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 font-mono text-xs font-semibold text-slate-700">
                    {rating} / 5
                  </span>
                </div>

                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share how the cooling performance and technician conduct were..."
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />

                <button
                  type="submit"
                  disabled={submittingReview || reviewComment.trim().length < 5}
                  className="mt-3 rounded-lg bg-sky-700 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
                >
                  {submittingReview ? 'Submitting...' : 'Submit Verified Review'}
                </button>
              </form>
            )}

            {booking.review && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                  <span>Your Verified Review Submitted</span>
                  <span className="font-mono">{booking.review.rating}.0 / 5</span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{booking.review.comment}</p>
              </div>
            )}

            {/* Booking Timeline */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Service &amp; Dispatch Timeline
              </h3>
              <ol className="mt-4 space-y-4">
                {[...booking.events].reverse().map((ev) => (
                  <li key={ev.id} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">{ev.title}</span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {formatIstTime(ev.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">{ev.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Right 4 Cols: Technician Card, Live Chat, Price Breakdown */}
          <div className="space-y-6 lg:col-span-4">
            {/* Assigned Technician Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold text-slate-500">Assigned Specialist</div>
              {booking.assignedTechnician ? (
                <div className="mt-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-bold text-slate-900">
                        {booking.assignedTechnician.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-700">
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>Admin KYC &amp; Police Verified</span>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className="font-bold text-slate-900">
                        ★ {booking.assignedTechnician.rating}
                      </div>
                      <div className="text-slate-500">
                        {booking.assignedTechnician.completedJobsCount} jobs
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5 font-mono">
                      <Phone className="h-3.5 w-3.5 text-sky-700" />
                      {booking.assignedTechnician.phone}
                    </span>
                    <span>{booking.assignedTechnician.experienceYears} yrs exp</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span>Operations dispatch is assigning the nearest verified technician.</span>
                </div>
              )}
            </div>

            {/* Live Customer-Technician Chat */}
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-sky-700" />
                  <span className="font-display text-sm font-semibold text-slate-900">
                    Technician Chat
                  </span>
                </div>
                <span className="font-mono text-xs text-slate-500">
                  {booking.messages.length} msgs
                </span>
              </div>

              <div className="max-h-64 space-y-3 overflow-y-auto p-4">
                {booking.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-3 text-xs ${
                      msg.senderRole === 'CUSTOMER'
                        ? 'ml-6 bg-sky-700 text-white'
                        : msg.senderRole === 'SYSTEM'
                          ? 'bg-slate-100 text-slate-600'
                          : 'mr-6 border border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 opacity-80">
                      <span className="font-semibold">{msg.senderName}</span>
                      <span className="font-mono text-[10px]">
                        {formatIstTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="leading-relaxed">{msg.text}</p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleSendMessage}
                className="flex items-center gap-2 border-t border-slate-200 p-3"
              >
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Share gate code or landmark..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sendingChat || !chatText.trim()}
                  aria-label="Send message"
                  className="rounded-lg bg-sky-700 p-2 text-white hover:bg-sky-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>

            {/* Price & Cancellation Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold text-slate-500">Payment &amp; Billing</div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Base Package ({booking.pricing.unitCount} unit)</span>
                  <span className="font-mono tabular-nums">
                    {formatInr(booking.pricing.totalPayableInr)}
                  </span>
                </div>
                {booking.pricing.approvedQuoteTotalInr > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Approved Repair Quote</span>
                    <span className="font-mono tabular-nums">
                      {formatInr(booking.pricing.approvedQuoteTotalInr)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">
                    {formatInr(booking.pricing.grandTotalInr)}
                  </span>
                </div>
                <div className="pt-1 font-mono text-slate-500">
                  {booking.paymentMethod} · {booking.paymentStatus}
                </div>
              </div>

              {['CONFIRMED', 'ASSIGNMENT_PENDING', 'ASSIGNED', 'TECHNICIAN_EN_ROUTE'].includes(
                booking.status,
              ) && (
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  className="mt-4 w-full rounded-lg border border-rose-200 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GST Tax Invoice Modal */}
      {invoiceOpen && booking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-bold text-slate-900">
                  VayuCare Tax Invoice
                </div>
                <div className="font-mono text-xs text-slate-500">
                  Ref {booking.reference} · {formatIstTime(booking.createdAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceOpen(false)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 border-y border-slate-200 py-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">{booking.address.customerName}</div>
              <div>
                {booking.address.houseNo}, {booking.address.street}, {booking.address.locality},{' '}
                {booking.address.city} {booking.address.pinCode}
              </div>
              <div className="mt-1 font-mono">{booking.address.phone}</div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>
                  {booking.pricing.serviceName} × {booking.pricing.unitCount}
                </span>
                <span className="font-mono tabular-nums">
                  {formatInr(booking.pricing.taxableAmountInr)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>CGST + SGST ({booking.pricing.gstRatePct}%)</span>
                <span className="font-mono tabular-nums">
                  {formatInr(booking.pricing.gstAmountInr)}
                </span>
              </div>
              {booking.quote?.status === 'APPROVED' && (
                <div className="flex justify-between text-slate-600">
                  <span>Approved Repair Estimate (Incl. GST)</span>
                  <span className="font-mono tabular-nums">
                    {formatInr(booking.quote.totalInr)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                <span>Total Invoice Amount</span>
                <span className="font-mono tabular-nums">
                  {formatInr(booking.pricing.grandTotalInr)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support / Complaint Modal */}
      {complaintOpen && booking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleComplaintSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Raise Warranty Revisit / Issue</span>
              </h3>
              <button
                type="button"
                onClick={() => setComplaintOpen(false)}
                className="rounded border border-slate-200 p-1 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Issue Category</label>
                <select
                  value={complaintCat}
                  onChange={(e) =>
                    setComplaintCat(e.target.value as typeof complaintCat)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="WARRANTY_REVISIT">Request Warranty Revisit</option>
                  <option value="COOLING_ISSUE">Cooling Issue Persists</option>
                  <option value="BILLING">Billing / Invoice Clarification</option>
                  <option value="BEHAVIOUR">Technician Conduct</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  rows={3}
                  required
                  value={complaintDesc}
                  onChange={(e) => setComplaintDesc(e.target.value)}
                  placeholder="Describe the issue clearly..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComplaintOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800"
              >
                Submit Ticket
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
