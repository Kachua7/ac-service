# MASTER ENGINEERING PROMPT

# Build a Production-Grade AC Servicing & Repair Marketplace for Rajasthan, India

## 0. YOUR ROLE AND EXPECTATIONS

You are acting as a complete senior engineering team consisting of:

-   Principal Software Architect
-   Senior Frontend Engineer
-   Senior Backend Engineer
-   Database Architect
-   Application Security Engineer
-   DevOps / Infrastructure Engineer
-   UI/UX Designer
-   Product Manager
-   QA and Automation Engineer
-   Performance Engineer

Your assignment is to architect and build a highly reliable, secure,
scalable, modular, production-oriented website for an air-conditioning
servicing and repair marketplace operating initially in Jaipur,
Rajasthan, India.

The product will eventually expand across Rajasthan and potentially
other Indian states.

The platform takes inspiration from Urban Company, but must not simply
clone its interface. Study its booking experience, identify its
strengths and weaknesses, and design a better customer experience with
improved operational transparency.

**The most important instruction: Build an actual working software
product, not a static prototype.**

Every important button, form, navigation element, booking interaction,
administrative control and state transition must work.

Do not simulate successful payments, technician assignments, bookings or
notifications when their corresponding integrations have not been
implemented.

Clearly distinguish between: 1. Implemented functionality. 2.
Functionality operating in development/mock mode. 3. Functionality
awaiting external credentials. 4. Future functionality.

Never claim production readiness without passing the appropriate tests
and security checks.

------------------------------------------------------------------------

# 1. PRODUCT VISION

Build a three-sided AC servicing marketplace.

### A. Customer-facing website

Customers should be able to:

-   Discover AC servicing and repair services.
-   Select their location anywhere within supported Rajasthan service
    areas.
-   Browse transparent service packages.
-   Select their AC type and relevant service requirements.
-   View prices, inclusions, exclusions and warranties.
-   Select available appointment slots.
-   Book a technician.
-   Pay online or choose supported alternative payment methods.
-   Track booking progress.
-   Communicate with assigned technicians.
-   View invoices and booking history.
-   Raise complaints and request warranty revisits.
-   Rate and review completed services.

### B. Technician portal

Technicians should be able to:

-   Register and submit verification information.
-   Complete an administrator-approved onboarding process.
-   Configure their working hours and service areas.
-   Go online/offline.
-   Receive job assignments.
-   Accept or reject assignments within defined rules.
-   View customer information necessary to fulfil a booking.
-   Navigate to customer locations.
-   Start and complete jobs.
-   Upload before-and-after photographs.
-   Perform inspections.
-   Submit itemised repair estimates.
-   Obtain customer approval before additional paid work.
-   Generate service reports.
-   Track their earnings and job history.

### C. Administrative dashboard

Administrators should have complete operational control.

They must be able to:

-   View bookings and their statuses.
-   Manage customers.
-   Manage technicians.
-   Verify technicians.
-   Configure service areas.
-   Create and modify service packages.
-   Manage pricing and promotions.
-   Monitor payments and refunds.
-   Handle cancellations and disputes.
-   View technician availability.
-   Monitor assignment failures.
-   Track complaints and warranty claims.
-   View revenue, commissions and business performance.
-   Manage website content.
-   Configure notifications.
-   Inspect audit logs.
-   Manage roles and permissions.

------------------------------------------------------------------------

# 2. DEVELOPMENT PHILOSOPHY

Follow these engineering principles throughout the project.

1.  Prefer simplicity over unnecessary complexity.
2.  Prefer established and maintained libraries over custom
    implementations.
3.  Never implement custom cryptography.
4.  Never store plaintext passwords.
5.  Never expose privileged credentials in frontend code.
6.  Never trust client-side validation alone.
7.  Never trust prices or payment amounts supplied by the client.
8.  Never trust customer-submitted technician availability.
9.  Never expose customer or technician information unnecessarily.
10. Every critical operation must be validated server-side.
11. Every financial operation must be auditable.
12. Every important asynchronous operation must be recoverable.
13. Every major module must be independently testable.
14. Use strict TypeScript throughout the application.
15. Avoid unnecessary dependencies.
16. Avoid premature microservices.
17. Do not create abstraction layers that add complexity without
    providing real value.
18. Document architectural decisions.
19. Write tests alongside implementation.
20. Optimize actual bottlenecks rather than blindly optimizing
    everything.

Do not sacrifice security, correctness or maintainability for
development speed.

------------------------------------------------------------------------

# 3. TECHNOLOGY STACK

Use the following preferred architecture unless a concrete technical
limitation justifies an alternative.

## Frontend

-   Next.js using the App Router.
-   React.
-   TypeScript with strict mode enabled.
-   Tailwind CSS.
-   shadcn/ui for reusable accessible components.
-   Lucide icons.
-   React Hook Form for form management.
-   Zod for schema validation.
-   TanStack Query where server-state management benefits from it.
-   Zustand only where shared client-side state genuinely requires it.

Use server components by default.

Use client components only when interactivity, browser APIs or
client-side state require them.

Avoid unnecessarily hydrating the entire application.

## Backend

Use Next.js server-side functionality for the initial modular monolith.

Organize business logic into independent domain modules.

Use: - TypeScript. - Zod validation. - REST APIs with documented
contracts. - Prisma ORM or another justified, mature PostgreSQL
data-access approach. - Background job processing for asynchronous
tasks. - Explicit transaction boundaries.

Keep business logic separate from UI components and route handlers.

Do not put all business logic inside API endpoints.

## Database

Primary database:

PostgreSQL.

Recommended extensions and capabilities: - PostGIS for geographic
queries. - Proper indexing. - Foreign keys. - Check constraints. -
Transactions. - JSONB only where appropriate. - Database-level
uniqueness constraints.

The database must support: - Customers. - Addresses. - Technicians. -
Service categories. - Service packages. - AC equipment details. -
Bookings. - Booking events. - Appointment slots. - Technician
availability. - Assignments. - Quotes. - Quote line items. - Payments. -
Refunds. - Coupons. - Reviews. - Complaints. - Notifications. -
Invoices. - Service areas. - Admin users. - Roles and permissions. -
Audit events.

Do not use an unstructured document database as the primary source of
truth for financial and booking records.

## Cache and queues

Preferred: - Redis. - BullMQ for background processing.

Use background jobs for: - Booking dispatch. - Notification delivery. -
Email delivery. - SMS delivery. - Payment reconciliation. - Scheduled
reminders. - Expired booking cleanup. - Analytics aggregation.

The PostgreSQL database must remain the authoritative source of booking
and payment state.

A Redis outage must not cause accepted bookings to disappear.

Implement a transactional outbox pattern or another reliable
event-publishing mechanism for critical operations.

## Storage

Use S3-compatible object storage for: - Technician verification
documents. - Service photographs. - Customer-uploaded AC photographs. -
Invoices. - Other relevant documents.

Use private buckets and signed URLs.

Never expose verification documents through public URLs.

## Testing

-   Vitest or Jest.
-   Playwright for end-to-end tests.
-   API integration tests.
-   Database integration tests.
-   Security-oriented tests.
-   Load testing with k6 or an equivalent tool.

## Deployment

Use Docker for reproducible development and deployment.

Provide: - Dockerfile. - Docker Compose. - Environment configuration
templates. - Database migration scripts. - Health checks. - Structured
logs. - Deployment instructions. - Backup and restoration instructions.

Do not assume paid infrastructure is available.

Keep the architecture compatible with low-cost hosting during the MVP
stage.

------------------------------------------------------------------------

# 4. PROJECT STRUCTURE

Create a clean, modular project structure.

Suggested structure:

``` text
ac-service-platform/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (public)/
│   │   │   ├── (customer)/
│   │   │   ├── (technician)/
│   │   │   ├── admin/
│   │   │   └── api/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── styles/
│   │
│   ├── worker/
│   │   ├── jobs/
│   │   ├── processors/
│   │   └── schedulers/
│   │
│   └── admin/ (only if a separate admin application is justified)
│
├── packages/
│   ├── database/
│   ├── validation/
│   ├── types/
│   ├── ui/
│   ├── config/
│   └── shared/
│
├── infrastructure/
│   ├── docker/
│   ├── deployment/
│   └── monitoring/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── security/
│   └── operations/
│
├── scripts/
├── tests/
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── README.md
└── package.json
```

Modify this structure if necessary, but preserve clear domain
boundaries.

Do not create empty folders or meaningless abstractions simply to match
the proposed structure.

------------------------------------------------------------------------

# 5. DESIGN SYSTEM AND USER EXPERIENCE

The website should look like a polished, trustworthy, premium Indian
home-services platform.

It must not look like a generic AI-generated SaaS template.

## Visual direction

Design principles:

-   Clean.
-   Modern.
-   Professional.
-   Friendly.
-   Trustworthy.
-   Mobile-first.
-   Fast.
-   Accessible.
-   Minimal unnecessary decoration.

Use a consistent visual design system.

Define: - Primary and secondary colours. - Typography scale. - Spacing
scale. - Border radii. - Shadows. - Button variants. - Form controls. -
Cards. - Modals. - Loading states. - Error states. - Empty states. -
Responsive breakpoints.

Avoid: - Excessive gradients. - Excessive animations. - Unnecessary
glassmorphism. - Huge empty sections. - Overcrowded layouts. - Generic
stock photography. - Misleading trust badges. - Fake customer reviews. -
Fake service availability. - Fake technician profiles.

Use realistic AC-related illustrations and photographs.

All animations must respect reduced-motion preferences.

Use accessible contrast ratios and keyboard navigation.

------------------------------------------------------------------------

# 6. CUSTOMER WEBSITE PAGES

Implement all of the following pages.

## 6.1 Landing page

Route: /

The landing page should include:

### Navigation

-   Logo and brand name.
-   Location selector.
-   Services.
-   How it works.
-   Offers.
-   Support.
-   Login/profile.
-   Primary booking CTA.

### Hero section

Headline should communicate convenience, reliability and professional AC
servicing.

Example positioning:

"Professional AC servicing, right at your doorstep."

Include: - Location input. - Service discovery. - Primary booking
button. - Supporting trust information.

### Location selector

Customers must be able to:

-   Enter a PIN code.
-   Search for a city.
-   Select a supported locality.
-   Enter an address manually.
-   Use device location after explicit permission.

Never assume that browser geolocation permission has been granted.

Validate the address and serviceability on the server.

Support Rajasthan cities and localities through administrator-managed
service-area records.

Initial city: Jaipur.

Potential future cities: Jodhpur, Udaipur, Kota, Ajmer, Bikaner, Alwar,
Bharatpur and other Rajasthan cities.

Do not advertise coverage in a location until the business has activated
that service area.

### Service categories

Display:

-   AC general servicing.
-   AC deep cleaning.
-   Jet pump cleaning.
-   AC repair.
-   Gas inspection and refill.
-   AC installation.
-   AC uninstallation.
-   AC maintenance.
-   Annual maintenance packages.

Each service must have a separate service detail page.

### Why choose us

Use factual benefits: - Verified technicians, only if verification has
actually been completed. - Transparent pricing. - Digital service
records. - Customer-approved repair estimates. - Warranty-backed
services, where applicable.

### How it works

1.  Select a service.
2.  Choose your location.
3.  Select an available slot.
4.  Confirm your booking.
5.  Technician visits.
6.  Service completed.
7.  Pay and review.

### Additional sections

-   Popular services.
-   Customer testimonials backed by genuine reviews.
-   Service coverage.
-   FAQs.
-   Contact information.
-   Footer with legal links.

------------------------------------------------------------------------

## 6.2 Service listing page

Route: /services

Display available service categories.

Each service card should show:

-   Name.
-   Photograph.
-   Short description.
-   Starting price, if a valid price exists.
-   Estimated duration.
-   Applicable AC types.
-   Warranty information.
-   Learn more button.
-   Book now button.

Implement sorting and filtering where useful.

Never display misleading starting prices.

------------------------------------------------------------------------

## 6.3 Service detail page

Route: /services/\[slug\]

Each service needs:

-   Detailed explanation.
-   What's included.
-   What's excluded.
-   Applicable AC types.
-   Estimated duration.
-   Pricing.
-   Additional charges, if applicable.
-   Warranty and revisit terms.
-   Customer preparation instructions.
-   Frequently asked questions.
-   Booking CTA.

Create separate service configurations in the database.

Do not hardcode service prices in frontend components.

### AC configuration

Allow customers to specify:

-   Split AC.
-   Window AC.
-   Inverter AC.
-   Non-inverter AC.
-   Brand.
-   Capacity, if known.
-   Number of AC units.
-   Age of AC, optional.
-   Symptoms or service requirements.

Do not force customers to know technical specifications they may not
understand.

------------------------------------------------------------------------

## 6.4 Booking flow

Route: /book/\[service\]

Build a multi-step booking process.

### Step 1: Service selection

Confirm the selected service and package.

### Step 2: AC details

Collect necessary AC details.

Allow multiple AC units.

### Step 3: Location

Select or create an address.

Address fields: - Customer name. - Phone number. - PIN code. - State. -
City. - Locality. - House/flat number. - Street. - Landmark. -
Additional instructions. - Latitude and longitude, when available.

Validate supported service coverage.

### Step 4: Date and appointment slot

Display genuinely available appointment slots.

Account for: - Technician working hours. - Existing bookings. - Service
duration. - Travel time. - Service area. - Temporary technician
unavailability.

Prevent double booking.

Use atomic database operations to reserve slots.

A displayed slot is not guaranteed until the reservation transaction
succeeds.

### Step 5: Price breakdown

Show: - Service price. - Additional units. - Optional add-ons. -
Discount. - Applicable taxes. - Final payable amount.

All prices must be calculated server-side.

### Step 6: Confirmation

Display a complete booking summary.

Require customer confirmation before creating the final booking.

Prevent duplicate submissions using idempotency keys.

### Step 7: Payment

Allow supported payment methods.

Do not create a paid booking based only on a frontend success response.

------------------------------------------------------------------------

## 6.5 Customer account

Routes: - /login - /register - /account - /account/bookings -
/account/addresses - /account/profile - /account/support

Authentication should support:

-   Secure phone-based OTP authentication.
-   Optional email authentication.
-   Secure session management.
-   Logout.
-   Account recovery.

OTP requirements: - Expiry. - Rate limiting. - Attempt limits. - Resend
cooldown. - Abuse detection. - Secure storage of verification
challenges.

Do not implement authentication using custom cryptographic mechanisms.

Use a mature authentication library or managed identity provider where
appropriate.

------------------------------------------------------------------------

## 6.6 Booking tracking page

Route: /bookings/\[bookingId\]

Show a clear timeline:

1.  Booking received.
2.  Payment status confirmed, if applicable.
3.  Technician assignment pending.
4.  Technician assigned.
5.  Technician on the way.
6.  Technician arrived.
7.  Inspection started.
8.  Quote awaiting approval, if necessary.
9.  Service in progress.
10. Service completed.
11. Payment completed.
12. Review requested.

Show: - Booking reference. - Service details. - Appointment time. -
Technician name. - Verified status, where genuinely verified. -
Technician contact through privacy-preserving communication where
possible. - Service location. - Price breakdown. - Cancellation
policy. - Support options.

Only show live tracking if actual location updates have been implemented
and the technician has granted the necessary permissions.

------------------------------------------------------------------------

## 6.7 Quote approval page

This is a particularly important feature.

Repair jobs may reveal unexpected faults.

The technician must be able to submit an estimate containing:

-   Diagnosis.
-   Parts required.
-   Labour charges.
-   Quantity.
-   Unit prices.
-   Taxes.
-   Warranty on parts, if applicable.
-   Total amount.
-   Estimated additional duration.

The customer must be able to:

-   Review the estimate.
-   Approve it.
-   Reject it.
-   Request clarification.

Store the customer's approval as an immutable business event.

No additional paid work may begin without approval.

Any revised estimate must require fresh approval.

------------------------------------------------------------------------

## 6.8 Payments and invoices

Route: /account/payments

Display: - Payment history. - Payment method. - Transaction reference. -
Booking reference. - Amount. - Payment status. - Refund status. -
Downloadable invoice.

Generate proper invoices.

Use INR as the primary currency.

------------------------------------------------------------------------

## 6.9 Reviews and complaints

Allow reviews after completed bookings only.

Support: - Star rating. - Written review. - Optional photographs. -
Service quality feedback. - Technician behaviour feedback.

Prevent review manipulation and duplicate submissions.

Allow customers to raise complaints with a reference number and status
tracking.

------------------------------------------------------------------------

# 7. TECHNICIAN PORTAL

Routes: - /technician/login - /technician/dashboard - /technician/jobs -
/technician/availability - /technician/profile - /technician/earnings -
/technician/history

## Technician onboarding

Collect: - Full name. - Phone. - Address. - Service experience. -
Skills. - Supported AC types. - Service areas. - Working hours. -
Identity and verification documents. - Bank or payout information where
required.

Sensitive documents must be private and access-controlled.

An administrator must approve a technician before they can receive jobs.

Do not automatically label someone verified simply because they
submitted documents.

## Technician availability

Technicians can: - Set working schedules. - Take breaks. - Go
online/offline. - Set leave. - Declare temporary unavailability.

Availability must be stored and evaluated server-side.

## Job assignment

Display: - Job reference. - Service type. - Locality. - Appointment
time. - Expected duration. - Relevant customer instructions.

Allow accept/reject operations with strict authorization and expiry.

Avoid exposing customer details before assignment unless operationally
necessary.

## Job execution

Technicians must be able to: - Start travel. - Mark arrival. - Start
inspection. - Upload evidence. - Submit quotations. - Record work
completed. - Record parts used. - Upload completion photographs. - Close
the job.

All important state changes must be auditable.

------------------------------------------------------------------------

# 8. ADMINISTRATIVE DASHBOARD

Routes: - /admin/login - /admin/dashboard - /admin/bookings -
/admin/customers - /admin/technicians - /admin/services -
/admin/pricing - /admin/service-areas - /admin/payments -
/admin/refunds - /admin/reviews - /admin/complaints - /admin/marketing -
/admin/analytics - /admin/settings - /admin/audit-logs

## Dashboard overview

Display:

-   Total bookings.
-   Today's bookings.
-   Pending assignments.
-   Completed bookings.
-   Cancelled bookings.
-   Active technicians.
-   Online technicians.
-   Revenue.
-   Refunds.
-   Average booking value.
-   Completion rate.
-   Cancellation rate.
-   Average assignment time.
-   Customer satisfaction.
-   Repeat customer rate.

Provide date filters and city/locality filters.

All analytics must be calculated from actual database data.

Never use hardcoded dashboard statistics.

## Booking management

Administrators can: - Search bookings. - Filter by status. - Filter by
location. - View booking history. - Assign/reassign technicians. -
Cancel bookings with reason. - Handle failed assignments. - Review
quotes. - Inspect payment status. - Handle disputes.

Do not permit administrators to alter financial records silently.

Use auditable correction and refund operations.

## Technician management

Administrators can: - Review onboarding applications. - Approve/reject
verification. - Suspend accounts. - Manage skills. - Manage service
areas. - Review performance. - Inspect complaints. - Review job
completion history.

## Service and pricing management

Create an admin-controlled catalogue.

Support: - Service categories. - Individual services. - Package
variants. - Base prices. - Add-ons. - Pricing by city or locality. - Tax
configuration. - Discounts. - Active/inactive states. - Warranty
configuration.

Every price change should be versioned and auditable.

Historical bookings must retain their original price snapshots.

## Role-based access control

Implement distinct roles:

-   Super administrator.
-   Operations manager.
-   Booking manager.
-   Finance manager.
-   Support agent.
-   Technician.

Use server-side permission checks.

Hiding an admin button is not an authorization mechanism.

------------------------------------------------------------------------

# 9. DATABASE DESIGN

Design a normalized PostgreSQL schema.

At minimum, include:

``` text
users
customer_profiles
technician_profiles
technician_documents
technician_skills
technician_service_areas
technician_availability

addresses
service_areas
service_categories
services
service_packages
service_price_versions
service_addons

ac_units
bookings
booking_items
booking_events
appointment_slots
technician_assignments

inspection_reports
repair_quotes
repair_quote_items
quote_approvals
service_completion_reports

payment_orders
payment_transactions
payment_webhook_events
refunds
invoices

coupons
promotions
reviews
complaints
support_tickets

notifications
notification_preferences

admin_roles
admin_permissions
admin_audit_logs

outbox_events
```

Requirements:

1.  Use UUIDs or another safe identifier strategy.
2.  Use foreign keys.
3.  Add indexes based on actual query patterns.
4.  Enforce important invariants at database level.
5.  Use decimal-safe monetary representations.
6.  Store timestamps in UTC.
7.  Display local time in Asia/Kolkata.
8.  Store customer-visible price snapshots.
9.  Store booking status history.
10. Prevent duplicate payment processing.
11. Prevent double booking.
12. Use database transactions for critical operations.

Use PostGIS for: - Service-area checks. - Nearby technician searches. -
Geographic filtering. - Distance calculations.

Never rely on frontend geographic filtering for business decisions.

Provide complete database migrations and an ER diagram.

------------------------------------------------------------------------

# 10. TECHNICIAN DISCOVERY AND DISPATCH ENGINE

This is one of the platform's most important modules.

A booking must be assigned to a real, approved and available technician.

## Candidate filtering

Initially filter technicians by:

1.  Account active.
2.  Verification approved.
3.  Required skills.
4.  Supported AC type.
5.  Active service area.
6.  Available working hours.
7.  No conflicting appointment.
8.  Acceptable travel distance.
9.  Ability to reach the location within the appointment window.

## Candidate ranking

Then rank eligible technicians using configurable weights:

-   Distance.
-   Availability.
-   Skill match.
-   Service quality.
-   Acceptance rate.
-   Historical completion rate.
-   Current workload.
-   Travel feasibility.

Do not rank solely by distance.

Avoid unfairly penalizing new technicians who have insufficient
historical data.

## Dispatch workflow

1.  Booking confirmed.
2.  Dispatch job created.
3.  Eligible technicians identified.
4.  Candidates ranked.
5.  Assignment offered.
6.  Technician accepts or rejects.
7.  If rejected or expired, offer next candidate.
8.  If no candidates are available, escalate to operations.
9.  Notify the customer about the actual assignment status.

Implement assignment locks and race-condition protection.

A technician must not receive overlapping jobs that cannot reasonably be
completed.

Support manual administrator assignment.

## Location privacy

Track technicians only when necessary for an active job or an explicitly
configured working mode.

Obtain appropriate permissions.

Do not continuously track technicians when they are off duty.

Restrict customer access to technician location information.

------------------------------------------------------------------------

# 11. BOOKING AND CONCURRENCY ARCHITECTURE

The system must support multiple simultaneous customer requests.

Implement:

-   Atomic appointment reservations.
-   Idempotent booking creation.
-   Database transactions.
-   Row-level locking where appropriate.
-   Unique constraints.
-   Booking expiry.
-   Retry-safe background jobs.
-   Queue monitoring.
-   Dead-letter handling.
-   Duplicate event protection.

Design the booking state machine.

Suggested states:

``` text
DRAFT
PENDING_PAYMENT
PAYMENT_PROCESSING
CONFIRMED
ASSIGNMENT_PENDING
ASSIGNED
TECHNICIAN_EN_ROUTE
TECHNICIAN_ARRIVED
INSPECTION_IN_PROGRESS
QUOTE_PENDING
QUOTE_APPROVED
SERVICE_IN_PROGRESS
COMPLETED
CANCELLED
FAILED
REFUND_PENDING
REFUNDED
```

Define valid transitions explicitly.

Do not allow arbitrary status updates from the frontend.

The system must handle: - Two users booking the same slot. - A payment
succeeding while the browser closes. - A technician rejecting an
assignment. - A worker crashing during dispatch. - Duplicate payment
webhooks. - Redis temporarily becoming unavailable. - A customer
submitting the booking form twice. - A network interruption during
payment. - A cancellation racing with assignment.

Provide retry and reconciliation mechanisms.

------------------------------------------------------------------------

# 12. PAYMENT INTEGRATIONS

Support India-oriented payment methods.

Investigate: - Razorpay. - Cashfree. - PhonePe Payment Gateway. - UPI. -
Cards. - Net banking. - Supported wallets. - Cash on service, if
business policy permits.

Prefer low-cost providers, but do not assume that any gateway is
permanently free.

Compare actual merchant onboarding requirements, settlement charges, UPI
charges, refund fees and applicable terms before choosing a provider.

Implement a provider abstraction:

``` text
PaymentProvider
  createOrder()
  verifyPayment()
  processWebhook()
  refundPayment()
  fetchPaymentStatus()
```

Use separate adapters for each gateway.

Security requirements:

-   Verify payment signatures server-side.
-   Verify webhook signatures.
-   Use idempotency.
-   Never trust frontend payment success.
-   Reconcile provider records against database records.
-   Maintain immutable transaction events.
-   Never store card numbers or CVV.
-   Use the provider's hosted checkout or secure SDK.
-   Keep secret keys server-side.
-   Support payment failure recovery.
-   Handle duplicate and out-of-order webhooks.

Do not mark a booking as paid until the provider's verified transaction
state supports it.

Support refunds through controlled server-side operations.

Create payment integration documentation and sandbox tests.

------------------------------------------------------------------------

# 13. MAPS AND LOCATION INTEGRATIONS

Evaluate: - Google Maps Platform. - Mappls. - OpenStreetMap. -
Nominatim, subject to its usage policy. - OSRM or another suitable
routing engine.

The application should support:

-   Address search.
-   PIN code validation.
-   Map-based address selection.
-   Reverse geocoding.
-   Serviceability checks.
-   Distance calculations.
-   Technician routing.
-   Locality-level coverage management.

Never expose unrestricted privileged map API keys.

Apply key restrictions and usage quotas.

Do not rely on a geocoding result alone to determine whether an address
is serviceable.

------------------------------------------------------------------------

# 14. NOTIFICATION SYSTEM

Build a unified notification module.

Channels:

-   SMS.
-   Email.
-   WhatsApp, subject to approved provider access and consent.
-   In-app notifications.
-   Browser push notifications, where supported.

Potential providers: - MSG91. - Exotel. - Twilio. - Approved WhatsApp
Business API providers. - Resend or another suitable email service.

Use notification templates.

Support: - Booking confirmation. - Technician assignment. - Appointment
reminders. - Technician arrival. - Quote approval requests. - Service
completion. - Payment receipts. - Refund updates. - Cancellation
notices.

Notifications must be asynchronous.

Failed notifications must not roll back an otherwise valid booking.

Implement retries, delivery logs and fallback channels.

Respect user consent and opt-out preferences.

------------------------------------------------------------------------

# 15. ADVERTISING AND MARKETING

Design the platform so monetization can be added without damaging the
booking experience.

Potential channels:

## Google

-   Google Ads Search campaigns.
-   Local service-intent campaigns.
-   Google Analytics.
-   Google Tag Manager.
-   Conversion tracking.

## Meta

-   Facebook Ads.
-   Instagram Ads.
-   Meta Pixel.
-   Conversions API where justified.

## Organic

-   SEO.
-   Google Business Profile.
-   Local landing pages.
-   Service-specific pages.
-   City-specific pages.
-   Useful AC maintenance articles.

## Website ad placement

Do not fill the booking flow with intrusive advertisements.

Potential placements: - Home page promotional banners. - Service listing
promotions. - Offers section. - Relevant seasonal campaigns.

Keep advertising separate from organic service ranking.

Clearly disclose sponsored placements.

Do not use deceptive urgency or fabricated discounts.

## Marketing measurement

Track: - Landing page visits. - Service page views. - Booking
initiation. - Booking completion. - Payment completion. - Customer
acquisition cost. - Conversion rate. - Repeat bookings.

Use consent-aware analytics and avoid collecting unnecessary personal
data.

------------------------------------------------------------------------

# 16. FAILURE HANDLING AND USER EXPERIENCE

The website must remain understandable when services are slow,
unavailable or failing.

This is mandatory.

Build reusable states:

-   Loading.
-   Skeleton loading.
-   Empty results.
-   Service unavailable.
-   Location unsupported.
-   Network failure.
-   Payment processing.
-   Payment verification pending.
-   Technician assignment delayed.
-   Booking conflict.
-   Unexpected server error.

## Visual feedback

Use tasteful animated illustrations, lightweight GIFs or Lottie
animations where appropriate.

Examples:

-   AC technician illustration while searching for technicians.
-   Subtle progress animation during booking.
-   Friendly waiting illustration during slow requests.
-   Retry illustration for network errors.
-   Clear success animation after verified completion.

Animations must not conceal error messages.

Do not use enormous GIF files.

Prefer optimized SVG/Lottie animations when appropriate.

Respect reduced-motion preferences.

## Timeouts and retries

Implement: - Request timeouts. - Controlled retry policies. -
Exponential backoff. - Circuit breakers for unstable external
providers. - Cancellation of obsolete requests. - Clear retry buttons.

Never blindly retry a payment creation or booking mutation.

Use idempotency keys.

## Service outage behaviour

If technician discovery fails:

-   Preserve the booking request.
-   Show a clear pending state.
-   Do not falsely claim a technician has been assigned.
-   Provide a realistic next step.
-   Notify the operations team.
-   Allow controlled recovery.

If the payment gateway is unavailable:

-   Do not lose the booking context.
-   Do not claim payment success.
-   Offer a safe retry or alternative supported payment method.

If the application backend is unavailable:

-   Display a branded fallback error page.
-   Provide a support channel.
-   Never expose internal stack traces.

------------------------------------------------------------------------

# 17. SECURITY REQUIREMENTS

Treat security as a core feature, not a final checklist.

Follow OWASP ASVS and relevant OWASP Top 10 guidance.

## Authentication

-   Secure password hashing using Argon2id or an established
    authentication provider.
-   Secure session handling.
-   Session expiry.
-   Session revocation.
-   CSRF protection where applicable.
-   Rate limiting.
-   Account enumeration protection.
-   OTP abuse prevention.
-   MFA for privileged administrator accounts.

## Authorization

Implement RBAC and ownership checks.

A customer may access only their own bookings.

A technician may access only jobs assigned to them and the data
necessary to fulfil them.

An operations manager must not automatically gain finance permissions.

Every privileged endpoint must enforce authorization on the server.

## Input validation

-   Validate all request bodies.
-   Validate query parameters.
-   Validate path parameters.
-   Enforce payload size limits.
-   Normalize user input.
-   Use parameterized database operations.
-   Prevent SQL injection.
-   Prevent XSS.
-   Prevent mass assignment.
-   Prevent insecure deserialization.

## Browser security

Configure appropriate: - Content Security Policy. - Strict Transport
Security. - Secure cookie flags. - SameSite policies. -
X-Content-Type-Options. - Referrer Policy. - Permissions Policy.

## Data protection

-   Encrypt traffic using HTTPS.
-   Restrict sensitive information.
-   Secure document storage.
-   Use signed access URLs.
-   Keep secrets in environment or secret-management systems.
-   Never commit .env files.
-   Redact sensitive information from logs.
-   Establish data retention and deletion rules.

## API security

-   Rate-limit authentication endpoints.
-   Rate-limit public APIs.
-   Protect against brute force.
-   Validate webhook signatures.
-   Prevent replay attacks.
-   Prevent IDOR/BOLA vulnerabilities.
-   Apply appropriate CORS rules.
-   Avoid exposing internal service information.

## Operational security

-   Dependency vulnerability scanning.
-   Secret scanning.
-   Static analysis.
-   Container image scanning.
-   Audit logging.
-   Backup protection.
-   Incident response documentation.

Never claim an application is secure merely because it uses HTTPS.

Provide a security threat model and document residual risks.

------------------------------------------------------------------------

# 18. INDIA-SPECIFIC COMPLIANCE

The platform will initially operate in Rajasthan, India.

Investigate applicable current requirements rather than assuming old
regulations remain unchanged.

Review:

-   Digital Personal Data Protection Act and applicable rules.
-   Consumer Protection Act and e-commerce requirements.
-   Applicable GST requirements.
-   Invoice and record-keeping requirements.
-   Payment aggregator requirements.
-   RBI-related requirements applicable to the selected payment
    arrangements.
-   SMS DLT requirements where applicable.
-   WhatsApp Business policies.
-   Consent and privacy requirements.
-   Terms of service.
-   Refund and cancellation policies.

Do not represent the platform as legally compliant without appropriate
review.

Build configurable tax and invoice rules.

Do not hardcode legal rates or assumptions.

Include: - Privacy policy. - Terms and conditions. - Cancellation
policy. - Refund policy. - Technician terms. - Complaint and grievance
contact information.

Recommend qualified legal and tax review before launch.

------------------------------------------------------------------------

# 19. PERFORMANCE AND OPTIMIZATION

The application must be fast on ordinary Indian mobile networks and
mid-range Android devices.

Target a high-quality mobile experience.

## Frontend performance

-   Server rendering where useful.
-   Static rendering for appropriate public pages.
-   Dynamic rendering only when needed.
-   Route-level code splitting.
-   Lazy-load non-critical components.
-   Responsive image optimization.
-   Modern image formats.
-   Font optimization.
-   Minimize JavaScript.
-   Avoid unnecessary client components.
-   Avoid excessive dependencies.
-   Prevent layout shifts.
-   Optimize third-party scripts.

## Performance targets

Aim for: - LCP ≤ 2.5 seconds. - INP ≤ 200 ms. - CLS ≤ 0.1.

Measure these rather than assuming them.

## Backend performance

-   Add indexes based on actual query patterns.
-   Avoid N+1 queries.
-   Use pagination.
-   Avoid loading unbounded collections.
-   Use efficient spatial queries.
-   Cache only appropriate data.
-   Add query timeouts.
-   Monitor slow queries.
-   Use connection pooling.
-   Avoid excessive database connections.

## Scalability

Start with a modular monolith.

Do not prematurely split into microservices.

Keep clear module boundaries so high-load modules can be separated later
if justified.

The system should be designed for horizontal scaling of stateless
application instances and independent background workers.

------------------------------------------------------------------------

# 20. SEO AND PUBLIC DISCOVERABILITY

Build search-engine-friendly public pages.

Include: - Semantic HTML. - Correct metadata. - Open Graph metadata. -
Canonical URLs. - Sitemap. - Robots.txt. - Structured data where
accurate. - Descriptive page titles. - Accessible headings. - Internal
linking. - Local SEO pages.

Potential routes:

``` text
/services/ac-cleaning
/services/ac-repair
/services/ac-gas-refill
/jaipur/ac-service
/jodhpur/ac-service
/udaipur/ac-service
/kota/ac-service
```

Only publish locality pages when there is actual service coverage.

Avoid automatically generating hundreds of thin or duplicate pages.

------------------------------------------------------------------------

# 21. ADMINISTRATIVE ANALYTICS

Build dashboards with real metrics.

Include:

### Operations

-   Bookings by day.
-   Bookings by city.
-   Pending assignments.
-   Average assignment time.
-   Average job completion time.
-   Technician utilization.
-   Cancellation reasons.

### Finance

-   Gross booking value.
-   Net revenue.
-   Platform commission.
-   Technician payouts.
-   Refunds.
-   Discounts.
-   Tax totals.

Clearly distinguish gross customer payments from actual business
revenue.

### Customers

-   New customers.
-   Repeat customers.
-   Customer retention.
-   Average order value.
-   Complaint rate.

### Technicians

-   Jobs completed.
-   Acceptance rate.
-   Cancellation rate.
-   Average rating.
-   On-time arrival rate.
-   Revisit rate.

Do not manipulate statistics to make the business look better.

Use clearly documented metric definitions.

------------------------------------------------------------------------

# 22. INTEGRATION ARCHITECTURE

Build independent adapters for external providers.

Suggested modules:

``` text
integrations/
  payments/
    payment-provider.interface.ts
    razorpay.adapter.ts
    cashfree.adapter.ts

  maps/
    geocoding.interface.ts
    map-provider.adapter.ts

  notifications/
    sms.adapter.ts
    email.adapter.ts
    whatsapp.adapter.ts

  storage/
    object-storage.adapter.ts

  analytics/
    analytics.adapter.ts
```

External provider failure must not unnecessarily break core booking
operations.

Use timeouts, retries, fallbacks and provider health checks.

Do not couple business logic to one payment gateway or map provider.

------------------------------------------------------------------------

# 23. OPEN-SOURCE REFERENCE RESEARCH

Before implementing complex features, examine relevant maintained
open-source projects.

Investigate:

-   Flutter and React service-booking examples.
-   Field-service management systems.
-   ERPNext/Frappe service-management functionality.
-   Open-source appointment booking systems.
-   Scheduling and dispatch algorithms.
-   Payment gateway SDKs.
-   Authentication libraries.
-   Admin dashboard templates.

Check: - Repository activity. - Maintainer activity. - Security
history. - License. - Dependency health. - Production suitability.

Do not blindly copy code.

Do not reuse code with incompatible licenses.

Document any substantial third-party dependencies and their licenses.

------------------------------------------------------------------------

# 24. TESTING REQUIREMENTS

Tests are mandatory.

## Unit tests

Test: - Price calculations. - Discount calculations. - Tax
calculations. - Booking state transitions. - Slot availability. -
Dispatch ranking. - Quote approval. - Permission checks. - Refund
calculations.

## Integration tests

Test: - Database operations. - Booking creation. - Payment order
creation. - Webhook verification. - Technician assignment. -
Notifications. - Invoice generation.

## End-to-end tests

Simulate:

### Customer

1.  Visit landing page.
2.  Select Jaipur.
3.  Select AC cleaning.
4.  Configure AC details.
5.  Enter address.
6.  Choose a slot.
7.  Review price.
8.  Complete sandbox payment.
9.  Receive confirmation.
10. Track booking.

### Technician

1.  Log in.
2.  View assignment.
3.  Accept job.
4.  Mark arrival.
5.  Perform inspection.
6.  Submit quote.
7.  Receive customer approval.
8.  Complete service.

### Administrator

1.  Log in.
2.  View booking.
3.  Assign technician.
4.  Monitor payment.
5.  Resolve complaint.
6.  Inspect audit history.

## Failure tests

Test: - Duplicate booking requests. - Concurrent slot reservations. -
Duplicate webhooks. - Invalid signatures. - Payment timeouts. - Redis
outage. - Worker restart. - Technician rejection. - No available
technicians. - Invalid permissions. - Unauthorized record access. -
Network interruption.

## Load testing

Use k6 or an equivalent tool.

Test: - Concurrent browsing. - Concurrent booking creation. -
Appointment-slot contention. - Authentication rate limits. - Payment
webhook bursts. - Dispatch queue backlogs.

Set measurable performance and error-rate thresholds.

Do not claim to support a particular number of simultaneous users
without load-test evidence.

------------------------------------------------------------------------

# 25. DOCUMENTATION

Produce:

1.  README.md.
2.  Architecture overview.
3.  System component diagram.
4.  Database ER diagram.
5.  API documentation.
6.  Authentication and authorization guide.
7.  Payment integration guide.
8.  Deployment guide.
9.  Environment variable reference.
10. Backup and recovery guide.
11. Security threat model.
12. Testing guide.
13. Troubleshooting guide.
14. Administrator manual.
15. Technician manual.

Include setup instructions that another developer can follow without
guessing.

------------------------------------------------------------------------

# 26. DEVELOPMENT PHASES

Do not attempt to build the entire application in one uncontrolled
operation.

Work in gated phases.

At the end of every phase: - Run relevant tests. - Run type checking. -
Run linting. - Review security implications. - Update documentation. -
List completed features. - List known limitations. - List remaining
tasks. - Confirm that existing functionality still works.

## PHASE 0 --- REPOSITORY AUDIT AND ARCHITECTURE

Inspect the existing repository before changing anything.

Determine: - Existing framework. - Dependencies. - Current
architecture. - Existing functionality. - Broken code. - Security
issues. - Build issues. - Deployment assumptions.

If a project already exists, preserve valuable working functionality.

Do not rewrite everything unnecessarily.

Produce: - Repository audit. - Architecture proposal. - Database
design. - API contracts. - Development roadmap. - Security threat
model. - Initial implementation backlog.

Do not start large-scale implementation before the architecture is
reviewed.

## PHASE 1 --- PROJECT FOUNDATION

Implement: - Next.js foundation. - TypeScript configuration. - Design
system. - PostgreSQL connection. - Database migrations. - Environment
validation. - Authentication foundation. - Logging. - Error handling. -
Docker setup. - Initial tests.

Deliver a running application.

## PHASE 2 --- CUSTOMER EXPERIENCE

Implement: - Landing page. - Service catalogue. - Service detail
pages. - Location selection. - Customer authentication. - Address
management. - AC configuration. - Booking wizard. - Appointment
availability.

Deliver a complete booking journey in development mode.

## PHASE 3 --- BACKEND BOOKING ENGINE

Implement: - Booking state machine. - Transactional booking creation. -
Slot locking. - Idempotency. - Queue infrastructure. - Dispatch
foundation. - Booking history.

## PHASE 4 --- TECHNICIAN PORTAL

Implement: - Technician onboarding. - Admin verification. -
Availability. - Job assignments. - Job execution. - Inspection. - Quote
generation. - Completion reports.

## PHASE 5 --- ADMIN DASHBOARD

Implement: - Admin authentication. - RBAC. - Booking management. -
Technician management. - Service management. - Pricing. - Service
areas. - Analytics. - Audit logs.

## PHASE 6 --- PAYMENTS AND INTEGRATIONS

Implement sandbox integrations first.

Then: - Payment gateway. - Webhooks. - Reconciliation. - Refunds. -
Invoices. - Notifications. - Maps. - Analytics.

Do not enable live financial transactions until all necessary checks and
credentials are in place.

## PHASE 7 --- RELIABILITY AND HARDENING

Implement: - Load testing. - Security testing. - Failure recovery. -
Monitoring. - Backups. - Alerting. - Performance optimization. -
Accessibility improvements. - Production deployment preparation.

## PHASE 8 --- EXPANSION

Prepare: - Additional Rajasthan cities. - Multi-city pricing. -
Additional service categories. - Annual maintenance contracts. -
Business/corporate accounts. - Technician payout automation. - Customer
loyalty. - Referral programs. - Native mobile application integration.

Do not build future modules until the core business justifies them.

------------------------------------------------------------------------

# 27. CODE QUALITY RULES

These requirements are non-negotiable.

### TypeScript

-   Enable strict mode.
-   Avoid `any`.
-   Use explicit domain types.
-   Use discriminated unions for state machines.
-   Avoid unsafe type assertions.
-   Validate external input at runtime.

### Architecture

-   Separate domain logic from infrastructure.
-   Avoid circular dependencies.
-   Avoid giant files.
-   Avoid giant React components.
-   Keep API handlers thin.
-   Keep database access predictable.
-   Centralize permission enforcement.
-   Use dependency injection only where useful.

### Error handling

-   Use structured application errors.
-   Never leak stack traces to users.
-   Log useful diagnostic context.
-   Redact secrets and personal data.
-   Preserve correlation IDs across background jobs.

### Code cleanup

-   Remove dead code.
-   Remove unused dependencies.
-   Remove duplicate logic.
-   Remove placeholder functions once real implementations exist.
-   Do not leave misleading TODOs.
-   Document intentional temporary limitations.

### Performance

-   Avoid unnecessary rendering.
-   Avoid redundant network calls.
-   Avoid unbounded database queries.
-   Avoid excessive polling.
-   Use efficient pagination.
-   Measure expensive operations.

### Security

-   Review every privileged route.
-   Validate every mutation.
-   Check ownership of every requested resource.
-   Verify all external callbacks.
-   Protect all financial operations.

------------------------------------------------------------------------

# 28. REQUIRED FINAL DELIVERABLES

The final project must contain:

1.  A complete working website.
2.  Customer booking experience.
3.  Technician portal.
4.  Administrative dashboard.
5.  PostgreSQL schema and migrations.
6.  Booking and dispatch engine.
7.  Payment-provider abstraction.
8.  Integration adapters.
9.  Responsive mobile-first design.
10. Automated test suite.
11. Docker development environment.
12. Environment configuration example.
13. API documentation.
14. Architecture documentation.
15. Security documentation.
16. Deployment instructions.
17. Known limitations report.

Provide a final report with:

-   What is implemented.
-   What is tested.
-   What is not implemented.
-   What requires credentials.
-   What requires legal/business approval.
-   What security checks were performed.
-   What performance tests were performed.
-   What known risks remain.

Never label incomplete integrations as production-ready.

------------------------------------------------------------------------

# 29. HOW YOU MUST WORK AS AN AI CODING AGENT

Follow this execution protocol.

### Step 1: Inspect before modifying

Examine the repository, package files, existing source code,
configuration and documentation.

Never assume the repository is empty.

### Step 2: Explain your architecture

Present: - Technology decisions. - System architecture. - Database
model. - Module boundaries. - Security strategy. - Development phases.

Explain major trade-offs.

### Step 3: Create an implementation plan

Break the work into small, independently verifiable tasks.

Prioritize a functioning end-to-end booking flow.

### Step 4: Implement incrementally

Do not generate thousands of lines of code in one uncontrolled response.

Implement a coherent feature at a time.

### Step 5: Verify everything

After each meaningful change:

``` bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Adapt commands to the actual package configuration.

Do not claim a command passed if it was not executed.

### Step 6: Review your own code

Act as an independent senior reviewer.

Look for: - Security vulnerabilities. - Race conditions. - Incorrect
business logic. - Poor database queries. - Memory leaks. - Unnecessary
dependencies. - Accessibility issues. - Performance bottlenecks. -
Incomplete error handling.

Fix serious findings before proceeding.

### Step 7: Preserve working functionality

Never destroy working modules to make implementation easier.

Use migrations and backward-compatible changes where practical.

### Step 8: Report progress accurately

After each phase, report:

``` text
PHASE:
COMPLETED:
FILES CREATED:
FILES MODIFIED:
DATABASE CHANGES:
TESTS EXECUTED:
TEST RESULTS:
SECURITY REVIEW:
KNOWN ISSUES:
NEXT PHASE:
```

Do not skip tests simply because implementation is taking longer than
expected.

------------------------------------------------------------------------

# 30. FIRST ACTION --- BEGIN PHASE 0

Do not immediately start generating the entire website.

First inspect the repository.

If no repository exists, establish the project directory and initialize
the architecture.

Then produce:

1.  A complete repository audit.
2.  A detailed architecture diagram.
3.  A database ER diagram.
4.  A complete customer booking journey.
5.  A technician workflow.
6.  An administrator workflow.
7.  An API endpoint specification.
8.  A security threat model.
9.  A realistic phased implementation backlog.

Identify all technical uncertainties.

Make reasonable engineering decisions where possible, documenting the
trade-offs instead of repeatedly asking unnecessary questions.

**Your ultimate objective is to deliver a secure, maintainable, fast and
commercially viable AC servicing marketplace---not merely an attractive
website.**

Start with Phase 0. Do not skip ahead.
