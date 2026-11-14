import {
  CheckCircle2,
  MapPin,
  Navigation,
  Play,
  Plus,
  Power,
  Send,
  ShieldCheck,
  Square,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Technician, WSEvent } from '../../shared/types';
import {
  api,
  type EnrichedBooking,
  formatInr,
  formatIstTime,
} from '../lib/api';
import { useRealtimeRoom } from '../lib/wsClient';

export function TechnicianPortal() {
  const [activeTech, setActiveTech] = useState<Technician | null>(null);
  const [jobs, setJobs] = useState<EnrichedBooking[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Quote builder
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [diagnosis, setDiagnosis] = useState(
    'Compressor run capacitor weak (18 µF measured vs 35 µF rated) + fan motor terminal oxidized.',
  );
  const [extraMins, setExtraMins] = useState(30);
  const [quoteItems, setQuoteItems] = useState([
    {
      partName: '35 µF Heavy-Duty Run Capacitor',
      quantity: 1,
      unitPriceInr: 480,
      labourInr: 250,
      warrantyDays: 90,
    },
  ]);

  // Chat
  const [chatText, setChatText] = useState('');

  const loadPortal = useCallback(async () => {
    try {
      const res = await api.getTechnicianPortal();
      setActiveTech(res.activeTechnician);
      setJobs(res.jobs);
      setSelectedJobId((prev) => {
        if (prev && res.jobs.some((j) => j.id === prev)) return prev;
        const activeFirst = res.jobs.find(
          (j) => j.status !== 'COMPLETED' && j.status !== 'CANCELLED',
        );
        return activeFirst?.id ?? res.jobs[0]?.id ?? null;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load technician portal.');
    }
  }, []);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  const handleWsEvent = useCallback(
    (event: WSEvent) => {
      if (event.type === 'ops:refresh') {
        loadPortal();
      } else if (event.type === 'booking:updated' || event.type === 'booking:created') {
        const b = event.payload.booking as EnrichedBooking;
        if (!activeTech || b.assignedTechnicianId === activeTech.id) {
          loadPortal();
        }
      } else if (event.type === 'technician:location') {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.payload.bookingId ? { ...j, tracking: event.payload.tracking } : j,
          ),
        );
      } else if (event.type === 'technician:status') {
        const updatedTech = event.payload.technician;
        if (activeTech?.id === updatedTech.id) setActiveTech(updatedTech);
      } else if (event.type === 'chat:message') {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.payload.bookingId &&
            !j.messages.some((m) => m.id === event.payload.message.id)
              ? { ...j, messages: [...j.messages, event.payload.message] }
              : j,
          ),
        );
      }
    },
    [activeTech, loadPortal],
  );

  useRealtimeRoom('global', handleWsEvent);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? jobs[0] ?? null;

  async function handleToggleOnline() {
    if (!activeTech) return;
    setErrorMsg(null);
    try {
      const res = await api.toggleTechnicianOnline(activeTech.id);
      setActiveTech(res.technician);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cannot toggle availability.');
    }
  }

  async function handleAdvance(
    nextStatus:
      | 'TECHNICIAN_EN_ROUTE'
      | 'TECHNICIAN_ARRIVED'
      | 'INSPECTION_IN_PROGRESS'
      | 'SERVICE_IN_PROGRESS'
      | 'COMPLETED',
    notes?: string,
  ) {
    if (!activeTech || !selectedJob) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await api.advanceJob(selectedJob.id, {
        technicianId: activeTech.id,
        nextStatus,
        notes,
      });
      setJobs((prev) => prev.map((j) => (j.id === res.booking.id ? res.booking : j)));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to advance job status.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStepGps() {
    if (!activeTech || !selectedJob) return;
    const res = await api.stepTechnicianLocation(selectedJob.id, activeTech.id);
    setJobs((prev) => prev.map((j) => (j.id === res.booking.id ? res.booking : j)));
  }

  async function handleToggleAutoDrive() {
    if (!activeTech || !selectedJob) return;
    const nextEnabled = !(selectedJob.tracking?.autoDriving ?? false);
    const res = await api.toggleAutoDrive(selectedJob.id, activeTech.id, nextEnabled);
    setJobs((prev) => prev.map((j) => (j.id === res.booking.id ? res.booking : j)));
  }

  async function handleRejectJob() {
    if (!activeTech || !selectedJob) return;
    setActionBusy(true);
    try {
      await api.rejectJob(selectedJob.id, activeTech.id);
      await loadPortal();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSubmitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTech || !selectedJob) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await api.submitQuote(selectedJob.id, {
        technicianId: activeTech.id,
        diagnosis,
        estimatedExtraMins: extraMins,
        items: quoteItems,
      });
      setJobs((prev) => prev.map((j) => (j.id === res.booking.id ? res.booking : j)));
      setQuoteOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not submit repair quote.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTech || !selectedJob || !chatText.trim()) return;
    await api.sendMessage(selectedJob.id, {
      senderRole: 'TECHNICIAN',
      senderName: activeTech.name,
      text: chatText.trim(),
    });
    setChatText('');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            {activeTech ? `${activeTech.name} — Field Console` : 'Technician Field Console'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {activeTech
              ? `${activeTech.baseLocality}, ${activeTech.city} · ${activeTech.phone}`
              : 'Manage assigned jobs, broadcast live arrival GPS, and submit repair quotes.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeTech && (
            <button
              type="button"
              onClick={handleToggleOnline}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                activeTech.online
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              <span>{activeTech.online ? 'Online for Dispatch' : 'Offline'}</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* Technician Stats Strip */}
      {activeTech && (
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-5">
          <div>
            <div className="text-xs text-slate-500">Verification</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <ShieldCheck
                className={`h-4 w-4 ${
                  activeTech.verificationStatus === 'APPROVED'
                    ? 'text-emerald-600'
                    : 'text-amber-600'
                }`}
              />
              <span>{activeTech.verificationStatus}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Rating</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {activeTech.rating > 0 ? `${activeTech.rating} / 5.0` : 'New'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Completed Jobs</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {activeTech.completedJobsCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">On-Time Rate</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {activeTech.onTimeRate}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Net Earnings</div>
            <div className="mt-0.5 font-mono text-base font-bold text-emerald-700 tabular-nums">
              {formatInr(activeTech.earningsInr)}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Job List */}
        <div className="space-y-3 lg:col-span-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Assigned Jobs ({jobs.length})
          </h2>

          {jobs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No jobs currently assigned to {activeTech?.name}.
            </div>
          ) : (
            jobs.map((job) => {
              const selected = selectedJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? 'border-sky-700 bg-sky-50/50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-slate-900">{job.reference}</span>
                    <span className="font-mono text-slate-500">{job.status}</span>
                  </div>
                  <div className="mt-1 font-display text-sm font-semibold text-slate-900">
                    {job.serviceName}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {job.address.locality} · {job.slotLabel}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Active Job Execution Console */}
        <div className="lg:col-span-8">
          {!selectedJob ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Select a job on the left to manage field execution.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs text-slate-500">
                      {selectedJob.reference} · {selectedJob.scheduledDate} · {selectedJob.slotLabel}
                    </div>
                    <h3 className="mt-1 font-display text-xl font-bold text-slate-900">
                      {selectedJob.serviceName}
                    </h3>
                    <div className="mt-2 flex items-start gap-2 text-sm text-slate-700">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                      <span>
                        {selectedJob.address.customerName} ({selectedJob.address.phone}) —{' '}
                        {selectedJob.address.houseNo}, {selectedJob.address.street},{' '}
                        {selectedJob.address.locality}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      Unit: {selectedJob.acDetails.quantity} × {selectedJob.acDetails.acType} (
                      {selectedJob.acDetails.inverterType}) · {selectedJob.acDetails.brand}{' '}
                      {selectedJob.acDetails.tonnage}
                      {selectedJob.acDetails.symptoms.length > 0 &&
                        ` · Symptoms: ${selectedJob.acDetails.symptoms.join(', ')}`}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-500">Current Stage</div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-sky-800">
                      {selectedJob.status}
                    </div>
                  </div>
                </div>

                {/* Field Action Controls */}
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <div className="text-xs font-semibold text-slate-700">
                    Field Execution &amp; Live GPS Broadcast
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {selectedJob.status === 'ASSIGNED' && (
                      <>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleAdvance('TECHNICIAN_EN_ROUTE')}
                          className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          <span>Start Travel to Customer</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={handleRejectJob}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Reject &amp; Re-dispatch</span>
                        </button>
                      </>
                    )}

                    {selectedJob.status === 'TECHNICIAN_EN_ROUTE' && (
                      <>
                        <button
                          type="button"
                          onClick={handleToggleAutoDrive}
                          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white ${
                            selectedJob.tracking?.autoDriving
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : 'bg-sky-700 hover:bg-sky-800'
                          }`}
                        >
                          {selectedJob.tracking?.autoDriving ? (
                            <>
                              <Square className="h-3.5 w-3.5" />
                              <span>Pause Auto-Drive GPS</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5" />
                              <span>Auto-Drive Jaipur Route (Live)</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleStepGps}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          Step GPS +1 Waypoint
                        </button>

                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleAdvance('TECHNICIAN_ARRIVED')}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Mark Arrived</span>
                        </button>
                      </>
                    )}

                    {selectedJob.status === 'TECHNICIAN_ARRIVED' && (
                      <>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleAdvance('INSPECTION_IN_PROGRESS')}
                          className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                        >
                          Start AC Inspection
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleAdvance('SERVICE_IN_PROGRESS')}
                          className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          Skip Quote · Start Service
                        </button>
                      </>
                    )}

                    {selectedJob.status === 'INSPECTION_IN_PROGRESS' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setQuoteOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          <span>Submit Repair Quote to Customer</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleAdvance('SERVICE_IN_PROGRESS')}
                          className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                        >
                          No Extra Parts Needed · Start Service
                        </button>
                      </>
                    )}

                    {selectedJob.status === 'QUOTE_PENDING' && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
                        Waiting for customer digital approval on quote ({formatInr(selectedJob.quote?.totalInr ?? 0)}).
                      </div>
                    )}

                    {selectedJob.status === 'QUOTE_APPROVED' && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => handleAdvance('SERVICE_IN_PROGRESS')}
                        className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        Quote Approved · Begin Repair Work
                      </button>
                    )}

                    {selectedJob.status === 'SERVICE_IN_PROGRESS' && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          handleAdvance(
                            'COMPLETED',
                            'Post-service supply vent ΔT verified at 11.2°C. No refrigerant leaks.',
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Complete &amp; Close Job</span>
                      </button>
                    )}

                    {selectedJob.tracking && selectedJob.status === 'TECHNICIAN_EN_ROUTE' && (
                      <div className="ml-auto flex items-center gap-3 font-mono text-xs text-slate-600 tabular-nums">
                        <span>Progress: {selectedJob.tracking.routeProgressPct}%</span>
                        <span>ETA: {selectedJob.tracking.etaMinutes}m</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quote Submission Form */}
              {quoteOpen && (
                <form
                  onSubmit={handleSubmitQuote}
                  className="rounded-xl border border-slate-200 bg-white p-6"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-base font-semibold text-slate-900">
                      Itemised Repair Estimate
                    </h4>
                    <button
                      type="button"
                      onClick={() => setQuoteOpen(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Inspection Diagnosis
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700">
                          Parts &amp; Labour Line Items
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuoteItems((prev) => [
                              ...prev,
                              {
                                partName: 'Copper Flare Nut & Valve Seal',
                                quantity: 1,
                                unitPriceInr: 220,
                                labourInr: 150,
                                warrantyDays: 60,
                              },
                            ])
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Item</span>
                        </button>
                      </div>

                      <div className="mt-2 space-y-2">
                        {quoteItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12"
                          >
                            <input
                              type="text"
                              value={item.partName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQuoteItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, partName: val } : it)),
                                );
                              }}
                              placeholder="Part name"
                              className="rounded border border-slate-300 px-2.5 py-1.5 text-xs sm:col-span-5"
                            />
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 1;
                                setQuoteItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, quantity: val } : it)),
                                );
                              }}
                              className="rounded border border-slate-300 px-2 py-1.5 font-mono text-xs sm:col-span-2"
                              title="Qty"
                            />
                            <input
                              type="number"
                              min={0}
                              value={item.unitPriceInr}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setQuoteItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, unitPriceInr: val } : it,
                                  ),
                                );
                              }}
                              className="rounded border border-slate-300 px-2 py-1.5 font-mono text-xs sm:col-span-2"
                              placeholder="Part ₹"
                            />
                            <input
                              type="number"
                              min={0}
                              value={item.labourInr}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setQuoteItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, labourInr: val } : it)),
                                );
                              }}
                              className="rounded border border-slate-300 px-2 py-1.5 font-mono text-xs sm:col-span-3"
                              placeholder="Labour ₹"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span>Extra Duration (min):</span>
                        <input
                          type="number"
                          value={extraMins}
                          onChange={(e) => setExtraMins(Number(e.target.value) || 15)}
                          className="w-20 rounded border border-slate-300 px-2 py-1 font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={actionBusy}
                        className="rounded-lg bg-sky-700 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                      >
                        Send Quote for Customer Approval
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Technician-Customer Chat */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
                  Direct Customer Chat
                </div>
                <div className="max-h-52 space-y-2.5 overflow-y-auto p-4">
                  {selectedJob.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg p-2.5 text-xs ${
                        m.senderRole === 'TECHNICIAN'
                          ? 'ml-8 bg-sky-700 text-white'
                          : 'mr-8 bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="mb-0.5 flex justify-between opacity-75">
                        <span className="font-semibold">{m.senderName}</span>
                        <span className="font-mono text-[10px]">
                          {formatIstTime(m.timestamp)}
                        </span>
                      </div>
                      <div>{m.text}</div>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={handleSendChat}
                  className="flex gap-2 border-t border-slate-200 p-3"
                >
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Message customer about ETA or gate..."
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-sky-700 px-3 py-2 text-white hover:bg-sky-800"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
