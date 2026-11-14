import { AlertCircle, ArrowRight, CheckCircle2, ShieldCheck, UserPlus, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { AuthUser, ServiceArea, UserRole } from '../../shared/types';
import { api } from '../lib/api';

interface LoginViewProps {
  serviceAreas: ServiceArea[];
  onAuthenticated: (user: AuthUser) => void;
}

const DEMO_TECHS = [
  { name: 'Rajendra Sharma (Vaishali Nagar)', phone: '+91 98290 41205' },
  { name: 'Vikram Singh Rathore (Malviya Nagar)', phone: '+91 98291 77310' },
  { name: 'Deepak Kumawat (C-Scheme)', phone: '+91 99280 55421' },
];

export function LoginView({ serviceAreas, onAuthenticated }: LoginViewProps) {
  const [role, setRole] = useState<UserRole>('CUSTOMER');

  // Customer fields
  const [custName, setCustName] = useState('Ananya Rathore');
  const [custPhone, setCustPhone] = useState('+91 98290 66214');

  // Technician fields
  const [techPhone, setTechPhone] = useState('+91 98290 41205');
  const [techPasscode, setTechPasscode] = useState('TECH2026');

  // Admin fields
  const [adminEmail, setAdminEmail] = useState('ops@vayucare.in');
  const [adminPasscode, setAdminPasscode] = useState('ADMIN2026');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Technician onboarding modal from Technician login tab
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardName, setOnboardName] = useState('');
  const [onboardPhone, setOnboardPhone] = useState('');
  const [onboardLocality, setOnboardLocality] = useState('Vaishali Nagar');
  const [onboardExp, setOnboardExp] = useState(4);
  const [onboardSuccess, setOnboardSuccess] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      if (role === 'CUSTOMER') {
        const res = await api.login({
          role: 'CUSTOMER',
          identifier: custPhone,
          name: custName,
        });
        onAuthenticated(res.user);
      } else if (role === 'TECHNICIAN') {
        const res = await api.login({
          role: 'TECHNICIAN',
          identifier: techPhone,
          passcode: techPasscode,
        });
        onAuthenticated(res.user);
      } else {
        const res = await api.login({
          role: 'ADMIN',
          identifier: adminEmail,
          passcode: adminPasscode,
        });
        onAuthenticated(res.user);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOnboardSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const activeAreas = serviceAreas.filter((a) => a.active);
    const area = activeAreas.find((a) => a.locality === onboardLocality) ?? activeAreas[0];
    if (!area) return;

    try {
      const res = await api.registerTechnician({
        name: onboardName,
        phone: onboardPhone,
        baseLocality: onboardLocality,
        serviceAreaIds: [area.id],
        skills: ['SERVICING', 'REPAIR', 'GAS_REFILL'],
        supportedAcTypes: ['SPLIT', 'WINDOW'],
        experienceYears: onboardExp,
      });
      setOnboardSuccess(
        `Application submitted for ${res.technician.name}. Admin Ops must verify KYC before portal activation (passcode: TECH2026).`,
      );
      setOnboardOpen(false);
      setOnboardName('');
      setOnboardPhone('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Onboarding submission failed.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-12">
          {/* Left Editorial Brand & Role Explanation */}
          <div className="flex flex-col justify-between bg-slate-900 p-8 text-white lg:col-span-5 lg:p-10">
            <div>
              <div className="font-display text-2xl font-bold tracking-tight text-white">
                VayuCare
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Jaipur &amp; Rajasthan AC Servicing Marketplace
              </p>

              <h1
                className="mt-8 font-display text-3xl font-bold leading-tight tracking-tight text-white"
                style={{ textWrap: 'balance' }}
              >
                Role-isolated access for customers, field technicians, and operations.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Sign in to your dedicated workspace. Customers book services and track live arrivals
                without internal operational tools; technicians and admins operate strictly inside
                their authenticated portals.
              </p>
            </div>

            <div className="mt-8 space-y-3 border-t border-slate-800 pt-6 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <span>
                  <strong className="text-white">Customer Portal:</strong> PIN coverage check, slot
                  booking, live GPS tracking, digital repair quote approval, and GST invoices.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <span>
                  <strong className="text-white">Technician Portal:</strong> Assigned field jobs,
                  live arrival GPS broadcast, and itemised spare-part estimates.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <span>
                  <strong className="text-white">Admin Operations:</strong> Real-time dispatch, KYC
                  verification, versioned rate cards, and audit logs.
                </span>
              </div>
            </div>
          </div>

          {/* Right Role-Separated Sign In Form */}
          <div className="p-8 lg:col-span-7 lg:p-10">
            <div className="text-xs font-medium text-slate-500">Select Portal to Sign In</div>

            {/* Interactive Segmented Role Selector */}
            <div
              role="tablist"
              aria-label="Portal role selection"
              className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
            >
              {(
                [
                  { id: 'CUSTOMER', label: 'Customer' },
                  { id: 'TECHNICIAN', label: 'Technician' },
                  { id: 'ADMIN', label: 'Admin Ops' },
                ] as const
              ).map((tab) => {
                const active = role === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setRole(tab.id);
                      setErrorMsg(null);
                    }}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
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

            {errorMsg && (
              <div
                role="alert"
                className="mt-5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {onboardSuccess && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
                {onboardSuccess}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              {role === 'CUSTOMER' && (
                <>
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      Customer Sign In
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Sign in with your mobile number to book AC services and track active arrivals.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="cust-login-phone"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Mobile Number
                    </label>
                    <input
                      id="cust-login-phone"
                      type="tel"
                      required
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      placeholder="+91 98290 66214"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cust-login-name"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Full Name
                    </label>
                    <input
                      id="cust-login-name"
                      type="text"
                      required
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      placeholder="e.g. Ananya Rathore"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                    Demo customer <span className="font-mono font-semibold">+91 98290 66214</span>{' '}
                    has active live booking <span className="font-mono font-semibold">VC-JPR-4082</span>{' '}
                    en route in Vaishali Nagar.
                  </div>
                </>
              )}

              {role === 'TECHNICIAN' && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">
                        Technician Portal Sign In
                      </h2>
                      <p className="mt-1 text-xs text-slate-600">
                        Authenticated access to your assigned jobs, live GPS broadcast, and quotes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOnboardOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>New Tech Apply</span>
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="tech-preset"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Registered Technician Profile
                    </label>
                    <select
                      id="tech-preset"
                      value={techPhone}
                      onChange={(e) => setTechPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    >
                      {DEMO_TECHS.map((t) => (
                        <option key={t.phone} value={t.phone}>
                          {t.name} — {t.phone}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="tech-login-phone"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Technician Mobile Number
                    </label>
                    <input
                      id="tech-login-phone"
                      type="tel"
                      required
                      value={techPhone}
                      onChange={(e) => setTechPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="tech-passcode"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Portal Passcode
                    </label>
                    <input
                      id="tech-passcode"
                      type="password"
                      required
                      value={techPasscode}
                      onChange={(e) => setTechPasscode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                    Sandbox technician passcode:{' '}
                    <span className="font-mono font-semibold text-slate-900">TECH2026</span>
                  </div>
                </>
              )}

              {role === 'ADMIN' && (
                <>
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      Admin Operations Sign In
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Restricted access for dispatch control, KYC verification, pricing, and audit
                      logs.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-email"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Administrator Email
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="admin-passcode"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Operations Passcode
                    </label>
                    <input
                      id="admin-passcode"
                      type="password"
                      required
                      value={adminPasscode}
                      onChange={(e) => setAdminPasscode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                    />
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                    Sandbox admin credentials:{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      ops@vayucare.in / ADMIN2026
                    </span>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:opacity-60"
              >
                <span>
                  {submitting
                    ? 'Signing In...'
                    : role === 'CUSTOMER'
                      ? 'Enter Customer Portal'
                      : role === 'TECHNICIAN'
                        ? 'Enter Technician Portal'
                        : 'Enter Admin Operations'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Technician Onboarding Application Modal */}
      {onboardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleOnboardSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              Technician Onboarding Application
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Submit your details for Admin KYC review before receiving live Jaipur jobs.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={onboardName}
                  onChange={(e) => setOnboardName(e.target.value)}
                  placeholder="e.g. Suresh Prajapat"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Mobile Number</label>
                <input
                  type="tel"
                  required
                  value={onboardPhone}
                  onChange={(e) => setOnboardPhone(e.target.value)}
                  placeholder="+91 98290 00000"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Primary Jaipur Locality
                  </label>
                  <select
                    value={onboardLocality}
                    onChange={(e) => setOnboardLocality(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {serviceAreas
                      .filter((a) => a.active)
                      .map((a) => (
                        <option key={a.id} value={a.locality}>
                          {a.locality}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Experience (Yrs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={35}
                    value={onboardExp}
                    onChange={(e) => setOnboardExp(Number(e.target.value) || 1)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOnboardOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800"
              >
                Submit Application
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
