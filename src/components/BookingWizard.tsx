import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  ACInverterType,
  ACType,
  PaymentMethod,
  PriceSnapshot,
  SlotAvailability,
} from '../../shared/types';
import {
  api,
  type BootstrapResponse,
  type EnrichedBooking,
  formatInr,
} from '../lib/api';

interface BookingWizardProps {
  bootstrap: BootstrapResponse;
  initialServiceId?: string;
  initialAreaId?: string;
  defaultCustomerName?: string;
  defaultCustomerPhone?: string;
  onBookingCreated: (booking: EnrichedBooking) => void;
  onCancel: () => void;
}

const COMMON_SYMPTOMS = [
  'Low or no cooling',
  'Water dripping indoors',
  'Unusual compressor/fan noise',
  'Foul odour from vents',
  'Ice formation on coils',
  'Routine seasonal cleanup',
];

const AC_BRANDS = ['Daikin', 'LG', 'Voltas', 'Blue Star', 'Hitachi', 'Samsung', 'O General', 'Other'];

export function BookingWizard({
  bootstrap,
  initialServiceId,
  initialAreaId,
  defaultCustomerName = '',
  defaultCustomerPhone = '',
  onBookingCreated,
  onCancel,
}: BookingWizardProps) {
  const activeServices = bootstrap.services.filter((s) => s.active);
  const activeAreas = bootstrap.serviceAreas.filter((a) => a.active);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [serviceId, setServiceId] = useState(
    initialServiceId && activeServices.some((s) => s.id === initialServiceId)
      ? initialServiceId
      : activeServices[0]?.id ?? '',
  );

  // Step 2: AC configuration
  const [acType, setAcType] = useState<ACType>('SPLIT');
  const [inverterType, setInverterType] = useState<ACInverterType>('INVERTER');
  const [brand, setBrand] = useState('Daikin');
  const [tonnage, setTonnage] = useState('1.5 Ton');
  const [quantity, setQuantity] = useState(1);
  const [ageYears, setAgeYears] = useState('2–4 years');
  const [symptoms, setSymptoms] = useState<string[]>(['Low or no cooling']);

  // Step 3: Address
  const [serviceAreaId, setServiceAreaId] = useState(
    initialAreaId && activeAreas.some((a) => a.id === initialAreaId)
      ? initialAreaId
      : activeAreas[0]?.id ?? '',
  );
  const [customerName, setCustomerName] = useState(defaultCustomerName);
  const [phone, setPhone] = useState(defaultCustomerPhone);
  const [houseNo, setHouseNo] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');

  // Step 4: Slot
  const todayStr = new Date().toISOString().slice(0, 10);
  const [scheduledDate, setScheduledDate] = useState(todayStr);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotId, setSlotId] = useState('');

  // Step 5: Pricing & Payment
  const [couponCode, setCouponCode] = useState('');
  const [couponNote, setCouponNote] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PriceSnapshot | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [idempotencyKey] = useState(
    () => `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedService = activeServices.find((s) => s.id === serviceId) ?? activeServices[0];
  const selectedArea = activeAreas.find((a) => a.id === serviceAreaId) ?? activeAreas[0];

  useEffect(() => {
    if (!selectedService) return;
    api
      .previewPricing({
        serviceId: selectedService.id,
        quantity,
        couponCode: couponCode.trim() || undefined,
      })
      .then((res) => {
        setPricing(res.pricing);
        setCouponNote(res.couponMessage);
      })
      .catch(() => {
        // Ignore transient preview error
      });
  }, [selectedService, quantity, couponCode]);

  useEffect(() => {
    if (step !== 4 || !selectedService || !selectedArea) return;
    setLoadingSlots(true);
    api
      .getSlots({
        date: scheduledDate,
        serviceAreaId: selectedArea.id,
        serviceCategory: selectedService.category,
        acType,
      })
      .then((res) => {
        setSlots(res.slots);
        const firstOpen = res.slots.find((s) => s.available);
        if (firstOpen && !res.slots.some((s) => s.slotId === slotId && s.available)) {
          setSlotId(firstOpen.slotId);
        }
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [step, scheduledDate, selectedArea, selectedService, acType]);

  function toggleSymptom(sym: string) {
    setSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((item) => item !== sym) : [...prev, sym],
    );
  }

  function validateStep(current: number): string | null {
    if (current === 1 && !selectedService) return 'Please choose a service package.';
    if (current === 3) {
      if (customerName.trim().length < 2) return 'Please enter customer full name.';
      if (phone.trim().length < 8) return 'Please enter a valid 10-digit mobile number.';
      if (houseNo.trim().length < 1) return 'Please enter house / flat number.';
      if (street.trim().length < 2) return 'Please enter street or colony name.';
      if (!selectedArea) return 'Please select an active Jaipur locality.';
    }
    if (current === 4 && !slotId) {
      return 'Please select an available appointment slot.';
    }
    return null;
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg(null);
    if (step < 5) setStep((s) => (s + 1) as 1 | 2 | 3 | 4 | 5);
  }

  async function handleConfirmBooking() {
    if (!selectedService || !selectedArea) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await api.createBooking({
        idempotencyKey,
        serviceId: selectedService.id,
        couponCode: couponCode.trim() || undefined,
        paymentMethod,
        scheduledDate,
        slotId,
        acDetails: {
          acType,
          inverterType,
          brand,
          tonnage,
          quantity,
          ageYears,
          symptoms,
        },
        address: {
          customerName: customerName.trim(),
          phone: phone.trim(),
          pinCode: selectedArea.pinCode,
          serviceAreaId: selectedArea.id,
          houseNo: houseNo.trim(),
          street: street.trim(),
          landmark: landmark.trim() || undefined,
          instructions: instructions.trim() || undefined,
        },
      });
      onBookingCreated(res.booking);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to confirm booking.');
    } finally {
      setSubmitting(false);
    }
  }

  const stepsMeta = [
    { num: 1, label: 'Service' },
    { num: 2, label: 'AC Setup' },
    { num: 3, label: 'Address' },
    { num: 4, label: 'Slot' },
    { num: 5, label: 'Confirm & Pay' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Service Catalogue</span>
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Schedule AC Service
          </h1>
        </div>

        {/* Step Indicator */}
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {stepsMeta.map((item) => {
            const active = step === item.num;
            const done = step > item.num;
            return (
              <li key={item.num}>
                <button
                  type="button"
                  disabled={item.num > step}
                  onClick={() => item.num <= step && setStep(item.num as 1 | 2 | 3 | 4 | 5)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-700 text-white'
                      : done
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  0{item.num}. {item.label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Main Wizard Step */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8">
          {step === 1 && (
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                01. Choose Your AC Service Package
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                All packages include pre-service diagnostic checks and digital warranty tracking.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {activeServices.map((svc) => {
                  const selected = svc.id === serviceId;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => setServiceId(svc.id)}
                      className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                        selected
                          ? 'border-sky-700 bg-sky-50/50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{svc.estimatedDurationMins} min</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {formatInr(svc.basePriceInr)}
                          </span>
                        </div>
                        <div className="mt-1.5 font-display text-base font-semibold text-slate-900">
                          {svc.name}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          {svc.shortDescription}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                02. AC Unit Details &amp; Symptoms
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Helps our dispatch engine assign a technician certified for your AC type.
              </p>

              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">AC Type</label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {(['SPLIT', 'WINDOW', 'CASSETTE'] as ACType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setAcType(type)}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                            acType === type
                              ? 'border-sky-700 bg-sky-700 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Compressor Technology
                    </label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'INVERTER', label: 'Inverter' },
                          { id: 'NON_INVERTER', label: 'Standard' },
                          { id: 'UNSURE', label: 'Not sure' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setInverterType(opt.id)}
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                            inverterType === opt.id
                              ? 'border-sky-700 bg-sky-700 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="ac-brand" className="block text-xs font-medium text-slate-700">
                      Brand
                    </label>
                    <select
                      id="ac-brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                    >
                      {AC_BRANDS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ac-ton" className="block text-xs font-medium text-slate-700">
                      Capacity
                    </label>
                    <select
                      id="ac-ton"
                      value={tonnage}
                      onChange={(e) => setTonnage(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                    >
                      {['1.0 Ton', '1.5 Ton', '2.0 Ton', '2.5+ Ton', 'Not sure'].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ac-qty" className="block text-xs font-medium text-slate-700">
                      Number of Units
                    </label>
                    <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-300 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        className="h-7 w-7 rounded border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100"
                      >
                        -
                      </button>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(8, q + 1))}
                        className="h-7 w-7 rounded border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="ac-age" className="block text-xs font-medium text-slate-700">
                    Approximate Unit Age
                  </label>
                  <select
                    id="ac-age"
                    value={ageYears}
                    onChange={(e) => setAgeYears(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 sm:max-w-xs"
                  >
                    {['Under 1 year', '1–2 years', '2–4 years', '5+ years'].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700">
                    Observed Symptoms (Select all that apply)
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMMON_SYMPTOMS.map((sym) => {
                      const active = symptoms.includes(sym);
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => toggleSymptom(sym)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-sky-700 bg-sky-50 text-sky-900'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {sym}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                03. Jaipur Service Address &amp; Contact
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Active Jaipur coverage only; coordinates are mapped for live technician arrival.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cust-name" className="block text-xs font-medium text-slate-700">
                    Customer Full Name *
                  </label>
                  <input
                    id="cust-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Rohan Mathur"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cust-phone" className="block text-xs font-medium text-slate-700">
                    Mobile Number *
                  </label>
                  <input
                    id="cust-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98290 00000"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="svc-area" className="block text-xs font-medium text-slate-700">
                    Active Jaipur Locality &amp; PIN *
                  </label>
                  <select
                    id="svc-area"
                    value={serviceAreaId}
                    onChange={(e) => setServiceAreaId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                  >
                    {activeAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.locality}, {area.city} — PIN {area.pinCode} (~
                        {area.estimatedArrivalMins} min dispatch)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="house-no" className="block text-xs font-medium text-slate-700">
                    House / Flat / Floor *
                  </label>
                  <input
                    id="house-no"
                    type="text"
                    value={houseNo}
                    onChange={(e) => setHouseNo(e.target.value)}
                    placeholder="e.g. Flat 304, Pearl Residency"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="street-name" className="block text-xs font-medium text-slate-700">
                    Street / Colony / Sector *
                  </label>
                  <input
                    id="street-name"
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="e.g. Gautam Marg, Block C"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="landmark" className="block text-xs font-medium text-slate-700">
                    Landmark (Optional)
                  </label>
                  <input
                    id="landmark"
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Near Central Park Gate"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="inst" className="block text-xs font-medium text-slate-700">
                    Arrival Instructions (Optional)
                  </label>
                  <input
                    id="inst"
                    type="text"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Ladder available, call on arrival"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                04. Select Date &amp; Available Technician Slot
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Slots reflect real-time server availability of verified technicians in{' '}
                {selectedArea?.locality}.
              </p>

              <div className="mt-5">
                <label htmlFor="sched-date" className="block text-xs font-medium text-slate-700">
                  Service Date
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <input
                    id="sched-date"
                    type="date"
                    min={todayStr}
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="mt-6">
                <div className="text-xs font-medium text-slate-700">Available Arrival Windows</div>
                {loadingSlots ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {slots.map((slot) => {
                      const selected = slot.slotId === slotId;
                      return (
                        <button
                          key={slot.slotId}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setSlotId(slot.slotId)}
                          className={`flex items-center justify-between rounded-lg border px-4 py-3.5 text-left transition-colors ${
                            !slot.available
                              ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                              : selected
                                ? 'border-sky-700 bg-sky-50 text-sky-950'
                                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-mono text-sm font-semibold tabular-nums">
                              {slot.label}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {slot.available
                                ? `${slot.availableTechnicians} verified tech(s) free`
                                : 'Window closed / booked'}
                            </div>
                          </div>
                          {selected && <CheckCircle2 className="h-4 w-4 text-sky-700" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                05. Review &amp; Payment Selection
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Final payable amount is calculated on the server. Confirm to dispatch your
                technician immediately.
              </p>

              <div className="mt-5 space-y-5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="font-semibold text-slate-900">{selectedService?.name}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {quantity} × {acType} ({inverterType}) · {brand} {tonnage}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-700">
                    <MapPin className="h-3.5 w-3.5 text-sky-700" />
                    <span>
                      {houseNo}, {street}, {selectedArea?.locality}, Jaipur ({selectedArea?.pinCode})
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-600">
                    Appointment: {scheduledDate} ·{' '}
                    {slots.find((s) => s.slotId === slotId)?.label ?? slotId}
                  </div>
                </div>

                {/* Coupon */}
                <div>
                  <label htmlFor="coupon-input" className="block text-xs font-medium text-slate-700">
                    Promo Code (Try JAIPUR100 or COOL15)
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="coupon-input"
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="JAIPUR100"
                      className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900"
                    />
                  </div>
                  {couponNote && (
                    <p
                      className={`mt-1.5 text-xs ${
                        pricing?.couponCode ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {couponNote}
                    </p>
                  )}
                </div>

                {/* Payment Method */}
                <div>
                  <span className="block text-xs font-medium text-slate-700">
                    Payment Method
                  </span>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(
                      [
                        {
                          id: 'UPI',
                          title: 'UPI / QR Instant',
                          sub: 'Zero convenience fee (Sandbox)',
                        },
                        {
                          id: 'CARD',
                          title: 'Debit / Credit Card',
                          sub: 'Verified checkout (Sandbox)',
                        },
                        {
                          id: 'PAY_AFTER_SERVICE',
                          title: 'Pay After Service',
                          sub: 'UPI or Cash post-completion',
                        },
                      ] as const
                    ).map((method) => {
                      const active = paymentMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setPaymentMethod(method.id)}
                          className={`rounded-lg border p-3.5 text-left transition-colors ${
                            active
                              ? 'border-sky-700 bg-sky-50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <CreditCard className="h-4 w-4 text-sky-700" />
                            <span>{method.title}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{method.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Navigation Controls */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => (step === 1 ? onCancel() : setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {step === 1 ? 'Cancel' : 'Previous'}
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
              >
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmBooking}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>
                  {submitting
                    ? 'Reserving Slot & Dispatching...'
                    : `Confirm Booking · ${pricing ? formatInr(pricing.totalPayableInr) : ''}`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Right Live Server-Calculated Price Summary */}
        <aside className="lg:col-span-4">
          <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Price Summary
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Server-calculated INR rate card
            </p>

            {pricing ? (
              <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {pricing.serviceName} × {pricing.unitCount}
                  </span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {formatInr(pricing.baseUnitPriceInr * pricing.unitCount)}
                  </span>
                </div>

                {pricing.multiUnitSavingsInr > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Multi-unit discount</span>
                    <span className="font-mono tabular-nums">
                      -{formatInr(pricing.multiUnitSavingsInr)}
                    </span>
                  </div>
                )}

                {pricing.discountInr > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Promo ({pricing.couponCode})</span>
                    <span className="font-mono tabular-nums">
                      -{formatInr(pricing.discountInr)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>GST ({pricing.gstRatePct}%)</span>
                  <span className="font-mono tabular-nums">
                    {formatInr(pricing.gstAmountInr)}
                  </span>
                </div>

                <div className="flex justify-between border-t border-slate-200 pt-3 font-semibold text-slate-900">
                  <span>Total Payable</span>
                  <span className="font-mono text-lg tabular-nums">
                    {formatInr(pricing.totalPayableInr)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 h-24 animate-pulse rounded bg-slate-100" />
            )}

            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              Any additional spare parts or gas discovered during inspection require your explicit
              approval inside the live tracking screen before work proceeds.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
