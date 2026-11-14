import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { ServiceArea, ServiceCategory, ServicePackage } from '../../shared/types';
import { api, type BootstrapResponse, formatInr } from '../lib/api';

interface LandingViewProps {
  bootstrap: BootstrapResponse;
  onStartBooking: (serviceId?: string, areaId?: string) => void;
  onTrackLive: (bookingRef?: string) => void;
}

const CATEGORY_TABS: Array<{ id: 'ALL' | ServiceCategory; label: string }> = [
  { id: 'ALL', label: 'All Services' },
  { id: 'SERVICING', label: 'Servicing' },
  { id: 'REPAIR', label: 'Repair' },
  { id: 'GAS_REFILL', label: 'Gas Refill' },
  { id: 'INSTALLATION', label: 'Installation' },
  { id: 'AMC', label: 'AMC Plans' },
];

export function LandingView({
  bootstrap,
  onStartBooking,
  onTrackLive,
}: LandingViewProps) {
  const [pinInput, setPinInput] = useState('302021');
  const [selectedAreaId, setSelectedAreaId] = useState('area-jpr-vaishali');
  const [serviceabilityResult, setServiceabilityResult] = useState<{
    serviceable: boolean;
    message: string;
    matchedArea: ServiceArea | null;
  } | null>(null);
  const [checkingArea, setCheckingArea] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ServiceCategory>('ALL');
  const [detailService, setDetailService] = useState<ServicePackage | null>(null);

  const activeServices = bootstrap.services.filter((s) => s.active);
  const filteredServices =
    categoryFilter === 'ALL'
      ? activeServices
      : activeServices.filter((s) => s.category === categoryFilter);

  const activeAreas = bootstrap.serviceAreas.filter((a) => a.active);
  const upcomingAreas = bootstrap.serviceAreas.filter((a) => !a.active);

  async function handlePinCheck(e: React.FormEvent) {
    e.preventDefault();
    setCheckingArea(true);
    try {
      const res = await api.checkServiceability({ pinCode: pinInput });
      setServiceabilityResult(res);
      if (res.matchedArea && res.serviceable) {
        setSelectedAreaId(res.matchedArea.id);
      }
    } catch {
      setServiceabilityResult({
        serviceable: false,
        message: 'Unable to verify PIN code right now. Please try again.',
        matchedArea: null,
      });
    } finally {
      setCheckingArea(false);
    }
  }

  async function handleLocalitySelect(areaId: string) {
    setSelectedAreaId(areaId);
    const area = bootstrap.serviceAreas.find((a) => a.id === areaId);
    if (area) setPinInput(area.pinCode);
    setCheckingArea(true);
    try {
      const res = await api.checkServiceability({ serviceAreaId: areaId });
      setServiceabilityResult(res);
    } finally {
      setCheckingArea(false);
    }
  }

  return (
    <div className="bg-slate-50">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            {/* Left Proposition */}
            <div className="flex flex-col justify-between lg:col-span-7">
              <div>
                <p className="text-sm font-medium text-sky-700">
                  Jaipur, Rajasthan · Verified AC Technicians · Live Arrival Map
                </p>
                <h1
                  className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl"
                  style={{ textWrap: 'balance' }}
                >
                  Professional AC servicing &amp; repair, tracked live to your door.
                </h1>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                  Schedule foam-jet cleaning, cooling diagnostics, or nitrogen-tested gas refills
                  across Jaipur with fixed rate cards, digital quote approval before spare parts
                  are fitted, and real-time technician GPS tracking.
                </p>

                {/* Location & PIN Serviceability Checker */}
                <form
                  onSubmit={handlePinCheck}
                  className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <label
                        htmlFor="hero-locality"
                        className="block text-xs font-medium text-slate-600"
                      >
                        Jaipur Locality
                      </label>
                      <select
                        id="hero-locality"
                        value={selectedAreaId}
                        onChange={(e) => handleLocalitySelect(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                      >
                        {bootstrap.serviceAreas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.locality}, {area.city} ({area.pinCode})
                            {!area.active ? ' — Upcoming' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <label
                        htmlFor="hero-pin"
                        className="block text-xs font-medium text-slate-600"
                      >
                        PIN Code
                      </label>
                      <input
                        id="hero-pin"
                        type="text"
                        maxLength={6}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="302021"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 tabular-nums focus:border-sky-600 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-end sm:col-span-3">
                      <button
                        type="submit"
                        disabled={checkingArea}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap"
                      >
                        {checkingArea ? 'Checking...' : 'Check PIN'}
                      </button>
                    </div>
                  </div>

                  {serviceabilityResult && (
                    <p
                      className={`mt-3 flex items-start gap-2 text-xs font-medium ${
                        serviceabilityResult.serviceable ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{serviceabilityResult.message}</span>
                    </p>
                  )}
                </form>

                {/* Primary CTA + Live Track Shortcut */}
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onStartBooking(undefined, selectedAreaId)}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap shrink-0"
                  >
                    <span>Book AC Service</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onTrackLive('VC-JPR-4082')}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
                  >
                    <span>Watch Live Demo Tracking (VC-JPR-4082)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Focal Architectural Schematic */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-900 p-6 text-white lg:col-span-5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Split &amp; Inverter Thermal Diagnostics</span>
                <span className="font-mono tabular-nums">Jaipur Ops · 08:00–20:00</span>
              </div>

              {/* Clean crisp technical Split AC SVG Illustration */}
              <div className="my-6 flex items-center justify-center">
                <svg
                  viewBox="0 0 380 210"
                  className="w-full max-w-sm"
                  role="img"
                  aria-label="Architectural Split AC cooling and diagnostic diagram"
                >
                  {/* Wall Mount Backing */}
                  <rect
                    x="30"
                    y="22"
                    width="320"
                    height="82"
                    rx="10"
                    fill="#1e293b"
                    stroke="#38bdf8"
                    strokeOpacity="0.4"
                    strokeWidth="1.5"
                  />
                  {/* Intake Louvers */}
                  <line x1="54" y1="42" x2="260" y2="42" stroke="#475569" strokeWidth="2" />
                  <line x1="54" y1="50" x2="260" y2="50" stroke="#475569" strokeWidth="2" />
                  {/* Digital Temp Display */}
                  <rect x="284" y="38" width="46" height="22" rx="4" fill="#0f172a" />
                  <text
                    x="307"
                    y="53"
                    textAnchor="middle"
                    fill="#38bdf8"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    18°C
                  </text>
                  {/* Output Vane */}
                  <path
                    d="M 48 88 L 332 88 L 324 98 L 56 98 Z"
                    fill="#0284c7"
                    fillOpacity="0.3"
                    stroke="#38bdf8"
                    strokeWidth="1"
                  />
                  {/* Thermal Airflow Vectors */}
                  <path
                    d="M 90 108 Q 84 142 66 176"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 155 108 Q 152 146 144 184"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 225 108 Q 228 146 236 184"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 290 108 Q 296 142 314 176"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  {/* Metric callouts */}
                  <rect x="30" y="182" width="146" height="22" rx="4" fill="#1e293b" />
                  <text
                    x="103"
                    y="196"
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Coil ΔT Target: 10–12°C
                  </text>
                  <rect x="204" y="182" width="146" height="22" rx="4" fill="#1e293b" />
                  <text
                    x="277"
                    y="196"
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Jet Pressure: 120 PSI
                  </text>
                </svg>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 text-xs">
                <div>
                  <div className="text-slate-400">Live Dispatch Zones</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-white tabular-nums">
                    {activeAreas.length} Jaipur Localities
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Quote Protection</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-white">
                    Zero Hidden Parts
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column operational proof strip below hero split */}
          <div className="mt-10 grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="font-display text-sm font-semibold text-slate-900">
                01. Police-Verified Specialists
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Only admin-approved technicians with Aadhaar KYC &amp; HVAC certification receive live
                jobs.
              </p>
            </div>
            <div>
              <div className="font-display text-sm font-semibold text-slate-900">
                02. Upfront INR Rate Cards
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Prices are locked server-side with automatic multi-unit discounts and 18% GST tax
                invoices.
              </p>
            </div>
            <div>
              <div className="font-display text-sm font-semibold text-slate-900">
                03. Digital Quote Approval
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                No extra spare part or gas charge is billed without your explicit digital approval.
              </p>
            </div>
            <div>
              <div className="font-display text-sm font-semibold text-slate-900">
                04. Real-Time Arrival Tracking
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Track technician GPS movement, live ETA, and direct chat from dispatch to
                completion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Service Catalogue */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Transparent AC Service Catalogue
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Multi-unit bookings automatically apply 10–15% additional unit savings. Use code{' '}
              <span className="font-mono font-semibold text-slate-900">JAIPUR100</span> for ₹100
              off.
            </p>
          </div>

          {/* Interactive Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {CATEGORY_TABS.map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((svc) => (
            <article
              key={svc.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-slate-300"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{svc.applicableAcTypes.join(' / ')}</span>
                  <span className="font-mono tabular-nums">
                    {svc.estimatedDurationMins} min · {svc.warrantyDays}d warranty
                  </span>
                </div>

                <h3 className="mt-2 font-display text-lg font-semibold text-slate-900">
                  {svc.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {svc.shortDescription}
                </p>

                <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  {svc.inclusions.slice(0, 3).map((inc) => (
                    <li key={inc} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" />
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div>
                  <div className="text-xs text-slate-500">Starting at</div>
                  <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {formatInr(svc.basePriceInr)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailService(svc)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartBooking(svc.id, selectedAreaId)}
                    className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800 whitespace-nowrap"
                  >
                    Book Now
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Proof & Coverage Split */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Verified Reviews */}
            <div className="lg:col-span-7">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                Verified Jaipur Customer Reviews
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Reviews are accepted exclusively after verified job completion.
              </p>

              <div className="mt-6 space-y-4">
                {bootstrap.reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {rev.customerName}
                        <span className="ml-2 font-normal text-slate-500">· {rev.locality}</span>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-xs font-semibold text-amber-700">
                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        <span>{rev.rating}.0 / 5</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">{rev.comment}</p>
                    <div className="mt-2 font-mono text-xs text-slate-500">
                      {rev.serviceName} · Ref {rev.bookingReference}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rajasthan Service Areas */}
            <div className="lg:col-span-5">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                Rajasthan Coverage
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Live operational dispatch in Jaipur; controlled pilot rollouts next.
              </p>

              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold text-slate-500">Active Jaipur Localities</div>
                <div className="mt-3 divide-y divide-slate-100">
                  {activeAreas.map((area) => (
                    <div
                      key={area.id}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
                      <div>
                        <span className="font-medium text-slate-900">{area.locality}</span>
                        <span className="ml-2 font-mono text-xs text-slate-500">
                          {area.pinCode}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-emerald-700 tabular-nums">
                        ~{area.estimatedArrivalMins} min ETA
                      </span>
                    </div>
                  ))}
                </div>

                {upcomingAreas.length > 0 && (
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <div className="text-xs font-semibold text-slate-500">
                      Planned Rajasthan Expansion
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {upcomingAreas.map((area) => (
                        <div
                          key={area.id}
                          className="flex items-center justify-between text-xs text-slate-500"
                        >
                          <span>
                            {area.city} — {area.locality}
                          </span>
                          <span className="font-mono">{area.pinCode}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <span className="font-display font-semibold text-slate-800">VayuCare</span>
            <span className="mx-2">·</span>
            <span>Jaipur AC Servicing &amp; Repair Marketplace (INR · IST Asia/Kolkata)</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <span>Grievance &amp; Warranty Desk: support@vayucare.in</span>
            <span>Terms · Privacy · Refund Policy</span>
          </div>
        </div>
      </footer>

      {/* Service Detail Modal */}
      {detailService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-detail-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500">
                  {detailService.applicableAcTypes.join(' / ')} ·{' '}
                  {detailService.estimatedDurationMins} min · {detailService.warrantyDays}-day
                  warranty
                </div>
                <h3
                  id="service-detail-title"
                  className="mt-1 font-display text-2xl font-bold text-slate-900"
                >
                  {detailService.name}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close service details"
                onClick={() => setDetailService(null)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {detailService.detailedDescription}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span>What is included</span>
                </h4>
                <ul className="mt-2.5 space-y-2 text-xs text-slate-700">
                  {detailService.inclusions.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Wrench className="h-4 w-4 text-slate-600" />
                  <span>Excluded (Quoted separately if needed)</span>
                </h4>
                <ul className="mt-2.5 space-y-2 text-xs text-slate-600">
                  {detailService.exclusions.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <h4 className="mt-5 text-sm font-semibold text-slate-900">Preparation Tips</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                  {detailService.preparationTips.map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
              <div>
                <div className="text-xs text-slate-500">Base Rate (Excl. 18% GST)</div>
                <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {formatInr(detailService.basePriceInr)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const id = detailService.id;
                  setDetailService(null);
                  onStartBooking(id, selectedAreaId);
                }}
                className="rounded-lg bg-sky-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
              >
                Configure &amp; Book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
