import {
  Activity,
  CheckCircle2,
  ClipboardList,
  IndianRupee,
  MapPin,
  ShieldAlert,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  AdminOverviewStats,
  AuditLogEntry,
  BookingComplaint,
  ServiceArea,
  ServicePackage,
  Technician,
  WSEvent,
} from '../../shared/types';
import {
  api,
  type EnrichedBooking,
  formatInr,
  formatIstTime,
} from '../lib/api';
import { useRealtimeRoom } from '../lib/wsClient';

type AdminTab = 'bookings' | 'technicians' | 'catalogue' | 'areas' | 'audit';

export function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>('bookings');
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [services, setServices] = useState<ServicePackage[]>([]);
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [complaints, setComplaints] = useState<BookingComplaint[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [inspectedBooking, setInspectedBooking] = useState<EnrichedBooking | null>(null);

  const loadOverview = useCallback(async () => {
    const res = await api.getAdminOverview();
    setStats(res.stats);
    setBookings(res.bookings);
    setTechnicians(res.technicians);
    setServices(res.services);
    setServiceAreas(res.serviceAreas);
    setComplaints(res.complaints);
    setAuditLogs(res.auditLogs);
    const drafts: Record<string, string> = {};
    for (const s of res.services) {
      drafts[s.id] = String(s.basePriceInr);
    }
    setPriceDrafts(drafts);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleWsEvent = useCallback(
    (event: WSEvent) => {
      if (
        event.type === 'booking:created' ||
        event.type === 'booking:updated' ||
        event.type === 'technician:status' ||
        event.type === 'ops:refresh'
      ) {
        loadOverview();
      }
    },
    [loadOverview],
  );

  useRealtimeRoom('admin:ops', handleWsEvent);

  const approvedTechs = technicians.filter((t) => t.verificationStatus === 'APPROVED');

  const filteredBookings =
    statusFilter === 'ALL'
      ? bookings
      : bookings.filter((b) => b.status === statusFilter);

  async function handleManualAssign(bookingId: string, techId: string) {
    if (!techId) return;
    await api.adminAssignTechnician(bookingId, techId);
    setNotice('Technician assignment updated and broadcast live.');
    await loadOverview();
  }

  async function handleVerifyTech(techId: string, status: 'APPROVED' | 'SUSPENDED' | 'PENDING') {
    await api.adminVerifyTechnician(techId, status);
    setNotice(`Technician verification updated to ${status}.`);
    await loadOverview();
  }

  async function handleSaveServicePrice(svc: ServicePackage) {
    const num = Number(priceDrafts[svc.id]);
    if (!Number.isFinite(num) || num < 99) return;
    await api.adminUpdateService(svc.id, { basePriceInr: num });
    setNotice(`Updated ${svc.name} price to ₹${num} (new price version logged).`);
    await loadOverview();
  }

  async function handleToggleServiceActive(svc: ServicePackage) {
    await api.adminUpdateService(svc.id, { active: !svc.active });
    await loadOverview();
  }

  async function handleToggleArea(areaId: string) {
    await api.adminToggleServiceArea(areaId);
    await loadOverview();
  }

  async function handleResolveComplaint(id: string) {
    await api.adminResolveComplaint(
      id,
      'Warranty revisit scheduled and verified by Jaipur Operations Lead.',
    );
    setNotice(`Complaint ${id} marked resolved.`);
    await loadOverview();
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof ClipboardList }> = [
    { id: 'bookings', label: 'Bookings & Dispatch', icon: ClipboardList },
    { id: 'technicians', label: 'Technicians & KYC', icon: Users },
    { id: 'catalogue', label: 'Service Pricing', icon: Wrench },
    { id: 'areas', label: 'Service Areas', icon: MapPin },
    { id: 'audit', label: 'Complaints & Audit', icon: ShieldAlert },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Breadcrumb Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs text-slate-500">Operations / Rajasthan / Jaipur Hub</div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Admin Operations Console
          </h1>
        </div>
        <div className="font-mono text-xs text-slate-500">
          Metrics computed live from persistent store
        </div>
      </div>

      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Real DB-Computed KPI Strip */}
      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Total Bookings</span>
              <Activity className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {stats.totalBookings}
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
              {stats.activeInProgress} active · {stats.pendingAssignments} unassigned
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Gross Value</span>
              <IndianRupee className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {formatInr(stats.grossBookingValueInr)}
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
              AOV {formatInr(stats.averageOrderValueInr)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Net Commission (22%)</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
              {formatInr(stats.platformCommissionInr)}
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
              GST {formatInr(stats.gstCollectedInr)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Verified Techs</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {stats.onlineTechnicians} / {stats.activeTechnicians}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">Online vs Approved</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Completion Rate</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {stats.completionRatePct}%
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
              {stats.completedBookings} done · {stats.cancelledBookings} cancelled
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Avg Rating</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {stats.averageRating}
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
              Dispatch ~{stats.averageAssignmentMins}m
            </div>
          </div>
        </div>
      )}

      {/* Workspace Layout: Sidebar + Main Viewport */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <nav className="space-y-1 rounded-xl border border-slate-200 bg-white p-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    active
                      ? 'bg-sky-700 text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="lg:col-span-9">
          {tab === 'bookings' && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Live Bookings &amp; Technician Assignment
                </h2>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  <option value="ALL">All Statuses ({bookings.length})</option>
                  <option value="ASSIGNMENT_PENDING">Unassigned</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="TECHNICIAN_EN_ROUTE">En Route</option>
                  <option value="QUOTE_PENDING">Quote Pending</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Reference</th>
                      <th className="px-4 py-3 font-semibold">Service &amp; Locality</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Assign Technician</th>
                      <th className="px-4 py-3 font-semibold text-right">Amount</th>
                      <th className="px-4 py-3 font-semibold text-right">Track</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 tabular-nums">
                          {b.reference}
                          <div className="font-sans text-[11px] font-normal text-slate-500">
                            {b.address.customerName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="font-medium text-slate-900">{b.serviceName}</div>
                          <div className="text-[11px] text-slate-500">
                            {b.address.locality} · {b.slotLabel}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-700">
                          {b.status}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Assign technician for ${b.reference}`}
                            disabled={b.status === 'COMPLETED' || b.status === 'CANCELLED'}
                            value={b.assignedTechnicianId ?? ''}
                            onChange={(e) => handleManualAssign(b.id, e.target.value)}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 disabled:bg-slate-100"
                          >
                            <option value="">Unassigned</option>
                            {approvedTechs.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.baseLocality})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatInr(b.pricing.grandTotalInr)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectedBooking(b)}
                            className="font-semibold text-sky-700 hover:underline"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'technicians' && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Technician Verification &amp; Fleet Roster
                </h2>
              </div>

              <div className="divide-y divide-slate-100">
                {technicians.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-base font-semibold text-slate-900">
                          {t.name}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          · {t.baseLocality} · {t.verificationStatus}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {t.phone} · {t.experienceYears} yrs exp · Skills: {t.skills.join(', ')}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Documents: {t.documentsSubmitted.join(' · ')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {t.verificationStatus !== 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyTech(t.id, 'APPROVED')}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Approve KYC</span>
                        </button>
                      )}
                      {t.verificationStatus === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyTech(t.id, 'SUSPENDED')}
                          className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'catalogue' && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Versioned Service Catalogue &amp; Rate Cards
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="font-display text-sm font-semibold text-slate-900">
                        {svc.name}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">
                        v{svc.priceVersion} · {svc.estimatedDurationMins} min · {svc.warrantyDays}d
                        warranty · {svc.active ? 'Active' : 'Paused'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={priceDrafts[svc.id] ?? ''}
                        onChange={(e) =>
                          setPriceDrafts((prev) => ({ ...prev, [svc.id]: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveServicePrice(svc)}
                        className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
                      >
                        Update ₹
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleServiceActive(svc)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {svc.active ? 'Pause' : 'Enable'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'areas' && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Rajasthan Service Coverage &amp; PIN Codes
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {serviceAreas.map((area) => (
                  <div
                    key={area.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {area.locality}, {area.city}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        PIN {area.pinCode} · ETA ~{area.estimatedArrivalMins}m ·{' '}
                        {area.active ? 'Live Coverage' : 'Inactive / Pilot'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleArea(area.id)}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
                        area.active
                          ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                          : 'bg-sky-700 text-white hover:bg-sky-800'
                      }`}
                    >
                      {area.active ? 'Deactivate' : 'Activate Locality'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'audit' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Customer Complaints &amp; Warranty Claims ({complaints.length})
                  </h2>
                </div>
                {complaints.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500">
                    No open customer complaints or warranty claims.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {complaints.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                      >
                        <div>
                          <div className="font-mono text-xs font-semibold text-slate-900">
                            {c.id} · {c.bookingReference} · {c.category} · {c.status}
                          </div>
                          <p className="mt-1 text-xs text-slate-700">{c.description}</p>
                        </div>
                        {c.status !== 'RESOLVED' && (
                          <button
                            type="button"
                            onClick={() => handleResolveComplaint(c.id)}
                            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Resolve Claim
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Immutable Operations Audit Trail
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {auditLogs.slice(0, 25).map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-900">
                          {log.action}
                        </span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="text-slate-700">{log.summary}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {log.actorName} · {formatIstTime(log.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Booking Inspection Modal */}
      {inspectedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-xs text-slate-500">
                  {inspectedBooking.reference} · {inspectedBooking.status}
                </div>
                <h3 className="mt-1 font-display text-xl font-bold text-slate-900">
                  {inspectedBooking.serviceName}
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  {inspectedBooking.address.customerName} ({inspectedBooking.address.phone}) ·{' '}
                  {inspectedBooking.address.houseNo}, {inspectedBooking.address.street},{' '}
                  {inspectedBooking.address.locality}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBooking(null)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {inspectedBooking.tracking && (
              <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3.5 text-xs">
                <div>
                  <div className="text-slate-500">Technician</div>
                  <div className="font-semibold text-slate-900">
                    {inspectedBooking.assignedTechnician?.name ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Route Progress</div>
                  <div className="font-mono font-semibold text-slate-900 tabular-nums">
                    {inspectedBooking.tracking.routeProgressPct}% (
                    {inspectedBooking.tracking.distanceRemainingKm.toFixed(2)} km)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Live ETA</div>
                  <div className="font-mono font-semibold text-slate-900 tabular-nums">
                    {inspectedBooking.tracking.etaMinutes} min
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5">
              <h4 className="text-xs font-semibold text-slate-700">Event History</h4>
              <ol className="mt-2.5 space-y-2.5">
                {[...inspectedBooking.events].reverse().map((ev) => (
                  <li key={ev.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <div className="flex justify-between font-semibold text-slate-900">
                      <span>{ev.title}</span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {formatIstTime(ev.timestamp)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-slate-600">{ev.description}</div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
