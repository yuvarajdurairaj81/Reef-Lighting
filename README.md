# Reef Lighting — Smart LED Lighting Management Platform

A multi-tenant web platform for configuring, monitoring and remotely controlling saltwater reef aquarium LED lights with **nine independent channels**. One application and one data model serve three kinds of customer:

| Customer | What they see |
|---|---|
| **Home: single tank** | Goes straight to their aquarium dashboard. No organization, site or tank-picker screens. |
| **Home: multiple tanks** | Tank selector on the dashboard and lighting screens, plus a "My Tanks" list. |
| **Enterprise** (public aquariums, stores, coral farms) | Organizations, sites, many tanks and controllers, role-based access, site summaries, audit log. |

> ⚠️ **Hardware status.** This release talks to lights through a **simulated controller adapter**. Every simulated device carries a purple **Simulated** badge in the UI and `isSimulated: true` in the API. Interfaces for real Bluetooth LE, local Wi-Fi and MQTT transports are defined, but those adapters return `501 NOT_IMPLEMENTED` until they are built. Nothing in this codebase claims to control real hardware yet.

---

## Table of contents

1. [What's in this release](#1-whats-in-this-release)
2. [Architecture](#2-architecture)
3. [Data model](#3-data-model)
4. [Repository layout](#4-repository-layout)
5. [How the app works: key flows](#5-how-the-app-works--key-flows)
6. [API overview](#6-api-overview)
7. [Security model](#7-security-model)
8. [Run it locally](#8-run-it-locally)
9. [Testing](#9-testing)
10. [Deploying to production (step by step)](#10-deploying-to-production-step-by-step)
11. [Configuration reference](#11-configuration-reference)
12. [Troubleshooting](#12-troubleshooting)
13. [Roadmap and known limitations](#13-roadmap--known-limitations)

---

## 1. What's in this release

The specification divides the work into six phases. **Phases 1–4 are implemented in full.** Phases 5–6 have their database tables, API contracts and UI entry points in place.

| Phase | Scope | Status |
|---|---|---|
| 1. Authentication | Registration, email verification, login, TOTP MFA, forgot/reset password, refresh-token rotation, "remember this device", passkeys (Face ID / Touch ID / Windows Hello) | ✅ Implemented |
| 2. Device management | Bluetooth check → discovery → BLE connect → Wi-Fi provisioning with step-by-step validation → register → assign to tank → rename / remove / refresh; firmware and last-seen display | ✅ Implemented (simulated transport) |
| 3. Dashboard | Tank/controller selector, totals, online/offline, active profiles, mode, channel intensities, power estimate, health, last sync, alerts, enterprise site roll-up | ✅ Implemented |
| 4. Lighting configuration | 9 sliders (0–100 %, 1 % steps, manual entry), live preview, AB+ preset, coral type presets, Save / Apply / Reset / Duplicate / Save As New, shared-profile confirmation (update all / new version / fork / per-tank override), per-controller wattage | ✅ Implemented |
| 5. Scheduling and cloud sync | Per-channel on/off windows, sunrise/sunset ramps, time zones, overrides, MQTT | 🧱 Schema + API (`PUT /profiles/:id/versions/:v/schedule`) + UI preview |
| 6. Enterprise | Orgs, sites, roles, shared profiles, audit logs, alerts, bulk ops | 🧱 Orgs/sites/RBAC/audit/alerts/sharing work. Invitations, role editing and bulk ops come next. |

Extras: a **voice-assistant entry point** that turns a spoken or typed command into a proposed change and acts only after you **explicitly confirm** it. It also has dark and light themes, a responsive mobile layout and Swagger documentation.

### The nine channels and the AB+ default

| # | Channel | Default max W | AB+ intensity |
|---|---|---|---|
| 1 | Ultraviolet (UV) | 15 | 90 % |
| 2 | Violet | 15 | 90 % |
| 3 | Royal Blue | 20 | 90 % |
| 4 | Blue | 20 | 95 % |
| 5 | Green | 10 | 2 % |
| 6 | Yellow | 10 | 2 % |
| 7 | Red | 10 | 3 % |
| 8 | White | 25 | 30 % |
| 9 | Moon Light | 5 | 20 % |
| | **Total** | **130 W** | **≈ 73.2 W estimated** |

**Power estimate** = Σ (channel max wattage × channel intensity / 100). Admins can set max wattage per controller. The UI labels the figure "Estimated" unless the controller reports measured power.

Built-in presets: **AB+, SPS, LPS, Soft Coral, Fish Only, Custom**. AB+ comes from the spec. The other presets are reasonable starting points that each tank owner should tune using PAR readings and how their corals respond. Coral categories map to recommended presets (SPS→SPS, LPS→LPS, Soft→Soft Coral, Mixed→AB+, Fish Only→Fish Only, Anemone→LPS).

---

## 2. Architecture

```mermaid
flowchart LR
  subgraph Client["Browser / future native app"]
    UI[React + TypeScript + Tailwind SPA]
    WB[Web Bluetooth / WebAuthn APIs]
  end
  subgraph Edge["nginx (frontend container)"]
    Static[Static assets]
    Proxy["/api → backend"]
  end
  subgraph API["Node.js + Express (backend container)"]
    Auth[Auth module<br/>JWT · refresh rotation · TOTP · WebAuthn]
    Tenancy[Tenancy + RBAC middleware]
    Lighting[Lighting / Profiles service]
    Devices[Device service]
    Adapter{{DeviceAdapter interface}}
    Sim[SimulatedDeviceAdapter ✅]
    BLE[BLE adapter 🧱]
    WIFI[Wi-Fi adapter 🧱]
    MQTT[MQTT adapter 🧱]
  end
  DB[(PostgreSQL<br/>Prisma ORM)]
  SMTP[(SMTP)]
  Broker[(MQTT broker · Phase 5)]
  Ctrl[[Reef LED controller<br/>stores profile + schedule,<br/>runs on its own clock]]

  UI --> Static
  UI -->|HTTPS + Bearer JWT| Proxy --> Auth & Tenancy
  Tenancy --> Lighting & Devices
  Lighting & Devices --> Adapter
  Adapter --> Sim
  Adapter -.-> BLE & WIFI & MQTT
  MQTT -.-> Broker -.-> Ctrl
  WB -.->|provisioning| Ctrl
  API --> DB
  Auth --> SMTP
```

**Design principles**

- **One data model for every customer.** Each account gets an Organization → Site → Tank tree. Home users never see it: the UI hides it whenever the organization is `PERSONAL` and has a single tank.
- **Tenant isolation at the boundary.** The `requireTenant` middleware picks the active organization from the `X-Organization-Id` header (or falls back to the user's default) and checks membership. Every query is then scoped by `organizationId`, and the guard helpers in `modules/tenancy/guards.ts` return 404 for anything outside the tenant.
- **Desired vs. reported state.** The cloud stores what it *wants* (`desiredState`) and what the controller *acknowledged* (`reportedState`), and tracks `syncStatus` (`PENDING`, `SYNCED` or `FAILED`). This pattern carries over directly to MQTT device shadows in Phase 5.
- **The controller is the source of truth for running lights.** Applied profiles are stored on the controller, which runs its schedule on its own clock. Losing internet only delays sync. It never interrupts the lighting.
- **Transport-agnostic IoT.** All hardware calls go through `DeviceAdapter`. Switching `IOT_ADAPTER=simulated` to `ble`, `wifi` or `mqtt` changes no other code.

---

## 3. Data model

```mermaid
erDiagram
  User ||--o{ Membership : has
  Organization ||--o{ Membership : has
  Organization ||--o{ Site : owns
  Site ||--o{ Tank : contains
  Tank ||--o{ Device : "lit by"
  Device ||--|{ LedChannel : "9 channels"
  Device ||--o{ DeviceConnection : log
  Device ||--o{ DeviceTelemetry : log
  Organization ||--o{ LightingProfile : owns
  LightingProfile ||--|{ ProfileVersion : versions
  ProfileVersion ||--|{ ChannelConfiguration : "9 intensities"
  ProfileVersion ||--o| LightingSchedule : schedule
  LightingSchedule ||--o{ ScheduleChannelWindow : "per-channel on/off"
  LightingSchedule ||--o{ ScheduleRamp : ramps
  LightingSchedule ||--o{ ScheduleOverride : overrides
  Tank ||--o| TankProfileAssignment : runs
  LightingProfile ||--o{ TankProfileAssignment : "assigned to"
  LightingProfile ||--o{ ProfileShare : "shared with"
  Organization ||--o{ Alert : raises
  Organization ||--o{ AuditLog : records
  RoleName ||--o{ RolePermission : grants
  Permission ||--o{ RolePermission : in
```

Key tables (full definitions in `backend/prisma/schema.prisma`; SQL in `backend/prisma/migrations/`):

| Entity | Purpose |
|---|---|
| `User`, `RefreshToken`, `EmailToken`, `PasskeyCredential`, `AuthChallenge` | Identity, sessions, email links, WebAuthn |
| `Organization` (`PERSONAL` / `ENTERPRISE`), `Membership` (the User Role entity), `Permission`, `RolePermission` | Tenancy and RBAC (Owner, Admin, Operator, Viewer) |
| `Site`, `Tank` | Physical hierarchy. Sites carry a time zone for scheduling. |
| `Device`, `LedChannel`, `DeviceConnection`, `DeviceTelemetry` | Controllers, per-channel max wattage, connection history, telemetry |
| `LightingProfile`, `ProfileVersion`, `ChannelConfiguration` | Versioned profiles with nine intensities and ramp durations |
| `TankProfileAssignment` | Which profile a tank runs, an optional **pinned version**, and **per-tank overrides** |
| `LightingSchedule`, `ScheduleChannelWindow`, `ScheduleRamp`, `ScheduleOverride` | Phase 5 scheduler foundation |
| `Alert`, `AuditLog` | Operations |

The **effective configuration** a tank sends to its controller is the assigned profile version (pinned, or the latest if not pinned) plus any per-tank overrides.

---

## 4. Repository layout

```
reef-lighting/
├── docker-compose.yml           # db, mailpit, backend, frontend (+ mqtt profile)
├── playwright.config.ts         # E2E (desktop Chrome + iPhone viewport)
├── e2e/                         # Playwright specs
├── .github/workflows/ci.yml     # typecheck, unit, integration, build, e2e
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # unified multi-tenant model
│   │   └── migrations/          # SQL migrations (prisma migrate deploy)
│   ├── src/
│   │   ├── app.ts / index.ts    # Express app + bootstrap
│   │   ├── config/env.ts        # validated environment (fails fast)
│   │   ├── domain/              # channels, presets, power formula, validation, RBAC
│   │   ├── iot/                 # DeviceAdapter interface, simulator, BLE/Wi-Fi/MQTT stubs
│   │   ├── middleware/          # auth, tenant, permission, validation, errors
│   │   ├── modules/
│   │   │   ├── auth/            # register, login, MFA, reset, passkeys
│   │   │   ├── tenancy/         # org, sites, tanks, tenant guards, bootstrap
│   │   │   ├── devices/         # onboarding + management
│   │   │   ├── lighting/        # tank lighting, profiles, presets, schedules
│   │   │   ├── dashboard/       # summary + energy
│   │   │   ├── alerts/          # alerts + audit log
│   │   │   ├── voice/           # intent parser + propose/confirm
│   │   │   └── meta/            # channel/preset metadata
│   │   ├── docs/openapi.ts      # Swagger spec
│   │   └── scripts/seed.ts      # demo data
│   └── tests/{unit,integration}
└── frontend/
    ├── src/
    │   ├── api/                 # centralized API client + types
    │   ├── auth/                # AuthContext (session, org switching, passkeys)
    │   ├── components/          # ChannelSlider, PowerPanel, SpectrumPreview, OnboardingWizard, ui
    │   ├── domain/channels.ts   # mirror of backend constants for instant feedback
    │   ├── iot/bluetooth.ts     # Web Bluetooth capability detection + GATT contract
    │   ├── layouts/             # sidebar + top bar, auth layout
    │   └── pages/               # Dashboard, Tanks, Devices, Lighting, Profiles, …
    ├── nginx.conf               # SPA + /api reverse proxy + security headers
    └── tests/                   # Jest + React Testing Library
```

---

## 5. How the app works: key flows

### 5.1 Registration and email verification

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend
  participant API
  participant DB
  participant Mail as SMTP
  U->>FE: Register (Home or Enterprise)
  FE->>API: POST /auth/register
  API->>DB: create User (bcrypt 12 rounds)
  API->>DB: create Organization + OWNER membership + Site + Tank, assign AB+
  API->>DB: store SHA-256 of one-time token (24h)
  API->>Mail: verification link
  U->>FE: clicks /verify-email?token=…
  FE->>API: POST /auth/verify-email
  API->>DB: mark verified, consume token
  FE-->>U: "Email confirmed — sign in"
```

- Home accounts get a `PERSONAL` org called "*Name*'s Reef", a "Home" site and a "My Reef Tank" tank running AB+.
- Enterprise accounts give their own organization name, and start with a "Main Site" and "Display Tank 1".
- Login stays blocked until the email is verified (`REQUIRE_EMAIL_VERIFICATION=true`). The login page offers a **Resend link** button.

### 5.2 Login, MFA, sessions

1. `POST /auth/login` checks the password. Unknown emails are still compared against a dummy hash so response timing doesn't reveal which emails exist.
2. If MFA is on, the API returns `{ mfaRequired, mfaToken }`, a 5-minute token that can only be used to finish login. The user then enters a 6-digit TOTP code at `POST /auth/mfa/verify`.
3. On success the API issues:
   - a **15-minute access JWT**, kept in memory only (never in localStorage), and
   - an **opaque refresh token** in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth`. The database stores only its SHA-256 hash.
4. **Remember this device** extends the refresh lifetime from 1 day to 30 days and makes the cookie persistent.
5. Each refresh **rotates** the token. Reusing an old token revokes the whole token family, which signals likely theft.
6. A password reset revokes every session.

### 5.3 Face ID / passkeys (WebAuthn)

Browsers cannot access Face ID directly. Instead the app runs a standard **WebAuthn** ceremony, and the operating system shows its own platform authenticator: Face ID or Touch ID on Apple devices, fingerprint or face unlock on Android, Windows Hello on PCs. The server only ever sees a public key and a signed challenge.

- **Enroll:** Settings → Passkeys → *Add a passkey*. This calls `/auth/passkeys/register/options`, then `startRegistration()`, then `/register/verify`.
- **Sign in:** Login → *Sign in with Face ID / passkey*. This uses discoverable credentials, so the user doesn't type an email. A user-verified passkey already counts as multi-factor, so TOTP is skipped.
- WebAuthn needs **HTTPS**; `localhost` is exempt for development. `WEBAUTHN_RP_ID` must equal the site's domain.

### 5.4 Device onboarding

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Onboarding wizard
  participant API
  participant AD as DeviceAdapter (Simulated)
  U->>FE: Add controller
  FE->>API: GET /devices/onboarding/bluetooth
  API->>AD: isBluetoothAvailable()
  FE->>API: POST /devices/onboarding/scan
  API->>AD: scan() → nearby controllers (registered ones filtered out)
  U->>FE: pick controller
  FE->>API: POST /devices/onboarding/connect
  API->>AD: connect() (BLE pairing)
  U->>FE: Wi-Fi SSID + password
  FE->>API: POST /devices/onboarding/wifi
  API->>AD: provisionWifi() — password used once, never stored or logged
  AD-->>API: steps[] BLUETOOTH_CHECK → DEVICE_AVAILABLE → BLE_CONNECTED → WIFI_VALIDATED → NETWORK_JOINED → CLOUD_REACHABLE
  API-->>FE: 200 with steps, IP, firmware  (or 422 with a specific error)
  U->>FE: name + tank
  FE->>API: POST /devices
  API->>AD: getStatus() (confirms reachability)
  API-->>FE: device created with 9 LedChannels (default wattages), sync = PENDING
```

**Clear error messages.** Each failure has its own code: `BLUETOOTH_DISABLED`, `DEVICE_NOT_FOUND`, `CONNECTION_FAILED`, `WIFI_INVALID` (bad SSID or password length), `WIFI_AUTH_FAILED`, `NETWORK_UNREACHABLE` ("2.4 GHz only"), and a 409 if the controller is already registered to another account.

**Built-in simulator test hooks**

| Input | Result |
|---|---|
| Wi-Fi password `wrongpass` | `WIFI_AUTH_FAILED` |
| SSID `fail-network` | `NETWORK_UNREACHABLE` |
| Any hardware ID ending `-OFFLINE` | Registers, then reports offline (Apply is queued and an alert is raised) |
| `SIM_FAILURE_RATE=0.3` | 30 % of operations fail at random, for exercising error paths |

**Real hardware later.** In production, BLE discovery and Wi-Fi provisioning run **between the phone or browser and the controller**: Web Bluetooth in Chrome, Edge or Android, or the native app on iOS, because Safari has no Web Bluetooth. The server then handles registration, configuration and telemetry. `frontend/src/iot/bluetooth.ts` already detects Web Bluetooth support and documents the planned GATT contract.

### 5.5 Lighting configuration: Save vs. Apply

| Button | What it does |
|---|---|
| **Save Configuration** | Validates, then stores the selected profile plus any channel values that differ from it as **per-tank overrides**. Marks the tank's controllers `PENDING`. Does **not** touch hardware. |
| **Apply Configuration** | Saves if there are unsaved changes, validates all nine channels (integers from 0 to 100), then pushes to every controller on the tank. The controller acknowledges and **stores the profile locally**. Status becomes `SYNCED`; an offline controller stays `PENDING` and raises an alert. The API responds 207 if only some controllers succeeded. |
| **Reset Configuration** | Discards unsaved slider changes. |
| **Duplicate Profile** | Copies the selected profile (including presets) into your organization. |
| **Save As New Profile** | Creates a new custom profile from the current sliders and assigns it to this tank. |
| **Update profile** (custom profiles only) | Edits the profile itself. If more than one tank uses it, a confirmation dialog appears (see below). |

Choosing a **coral type** loads the recommended preset, which you can then adjust. The **real-time preview** shows a stylized tank lit with the current color mix, a spectrum bar, and the per-channel wattage chart, all updating as you drag. Channels that differ from the profile get an **override** badge.

### 5.6 Shared profiles across tanks

When a profile is assigned to two or more tanks, `PUT /profiles/:id` without a strategy returns **409 `SHARED_PROFILE_CONFIRMATION`** and lists the affected tanks. The UI then offers four choices:

| Choice | `strategy` | Effect |
|---|---|---|
| Update all assigned tanks | `UPDATE_ALL` | New version; every tank following "latest" picks it up and goes `PENDING` |
| Create a new version | `NEW_VERSION` | New version; the other tanks are **pinned** to the previous version, and only this tank moves |
| Fork for this tank | `FORK` | Shared profile untouched; a copy is created and assigned to this tank |
| Just override this tank | (Save) | Profile untouched; differences stored as per-tank overrides |

Built-in presets are read-only, and so are profiles that another user shared with you. Use Duplicate or Save As New instead.

### 5.7 Offline operation (design contract)

1. **Apply** sends the full profile to the controller: nine intensities, ramp durations, and (in Phase 5) the schedule.
2. The controller saves it to flash (`storedOnDevice: true` in the acknowledgement) and runs it on its own RTC.
3. If Wi-Fi or the internet drops, the lights keep running normally. The cloud shows the controller as `OFFLINE` and keeps any new changes as `desiredState` with `PENDING` status.
4. On reconnect (Phase 5, MQTT), the controller receives the **retained** desired-state message, applies it, and publishes `reported`, which flips the status to `SYNCED`.

### 5.8 Voice assistant entry point

`POST /voice/intents` turns text (for example "set blue to 60 percent", "apply the SPS profile", "turn off the lights") into an **intent** and returns a summary plus a 2-minute confirmation token. **Nothing changes yet.** The change runs only after `POST /voice/confirm` with that token, which requires the `device:apply` permission. The parser is deliberately simple and rule-based. Swap in Alexa, Google Assistant, Siri Shortcuts or an LLM, and keep the same propose → confirm contract. Try it under **Settings → Voice assistant**.

### 5.9 Roles

| Permission | Owner | Admin | Operator | Viewer |
|---|:-:|:-:|:-:|:-:|
| View tanks, devices, profiles, alerts | ✅ | ✅ | ✅ | ✅ |
| Apply lighting, edit profiles, ack alerts | ✅ | ✅ | ✅ | |
| Onboard/remove devices, manage tanks and sites | ✅ | ✅ | | |
| Set channel wattage, manage users, view audit log | ✅ | ✅ | | |

---

## 6. API overview

Interactive docs: **`http://localhost:4000/api/docs`** (Swagger UI). JSON spec: `/api/docs.json`.

All routes live under `/api/v1`. Tenant routes need `Authorization: Bearer <accessToken>` and optionally take `X-Organization-Id`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/verify-email`, `/resend-verification`, `/login`, `/mfa/verify`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`; `GET /auth/me`; `POST /auth/mfa/setup`, `/mfa/enable`, `/mfa/disable` |
| Passkeys | `POST /auth/passkeys/register/options`, `/register/verify`, `/login/options`, `/login/verify`; `GET /auth/passkeys`; `DELETE /auth/passkeys/:id` |
| Tenancy | `GET/PATCH /organization`, `GET /organization/members`, `GET/POST /sites`, `PATCH/DELETE /sites/:id`, `GET/POST /tanks`, `PATCH/DELETE /tanks/:id` |
| Devices | `GET /devices/onboarding/bluetooth`, `POST /devices/onboarding/scan`, `/connect`, `/wifi`; `GET/POST /devices`; `GET/PATCH/DELETE /devices/:id`; `POST /devices/:id/refresh`; `PUT /devices/:id/wattage` |
| Lighting | `GET/PUT /tanks/:tankId/lighting`, `POST /tanks/:tankId/lighting/apply`, `POST /tanks/:tankId/lighting/preview` |
| Profiles | `GET/POST /profiles`, `GET/PUT/DELETE /profiles/:id`, `POST /profiles/:id/duplicate`, `POST /profiles/:id/share`, `GET/PUT /profiles/:id/versions/:v/schedule` |
| Dashboard | `GET /dashboard?tankId=&deviceId=`, `GET /dashboard/energy` |
| Ops | `GET /alerts`, `PATCH /alerts/:id`, `GET /audit-logs` |
| Voice | `POST /voice/intents`, `POST /voice/confirm` |
| Meta | `GET /meta/lighting`, `GET /meta/iot`; health: `GET /health` |

Errors always look like this: `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { … } } }`.

---

## 7. Security model

- **Passwords:** bcrypt with 12 rounds; minimum 10 characters with at least one letter and one number. Login, registration and reset are rate-limited (20 requests per 15 minutes per IP).
- **Tokens:** short-lived access JWTs held in memory; rotating refresh tokens in `httpOnly` cookies; only hashes stored; token-reuse detection.
- **Email and reset links:** random 256-bit tokens, stored hashed, single-use, expiring after 24 h (verification) or 1 h (reset). Forgot-password and sharing respond the same way whether or not the email exists.
- **MFA secrets:** encrypted at rest with AES-256-GCM (`MFA_ENCRYPTION_KEY`).
- **Wi-Fi passwords:** forwarded to the controller once; never stored, logged or returned. The logger redacts passwords, codes, tokens and cookies.
- **Tenancy:** membership is checked on every request, every query is scoped to the organization, and cross-tenant IDs return 404.
- **Input validation:** Zod on every request body; unknown channels are rejected; strict 0–100 integer intensities.
- **HTTP:** Helmet headers, CORS limited to `CORS_ORIGINS`, 100 kB JSON limit, `trust proxy` for correct client IPs, and an nginx `Permissions-Policy` allowing Bluetooth and WebAuthn only for this origin.
- **Secrets:** environment-only. The app refuses to boot if secrets are missing or under 32 characters. The frontend bundle contains no secrets.
- **Audit:** logins, failed logins, MFA changes, device registration and removal, saves, applies, profile edits, shares and voice executions are written to `AuditLog`.

---

## 8. Run it locally

### Option A: everything in Docker (quickest)

Prerequisites: Docker Desktop (or Docker Engine with Compose v2).

```bash
git clone <your-repo-url> reef-lighting && cd reef-lighting
cp backend/.env.example backend/.env       # dev defaults work as-is
docker compose up -d --build               # db, mailpit, backend (runs migrations), frontend
docker compose exec backend node dist/scripts/seed.js   # optional demo data
```

| URL | What |
|---|---|
| http://localhost:8080 | The app |
| http://localhost:4000/api/docs | Swagger UI |
| http://localhost:8025 | Mailpit: open verification and reset emails here |

### Option B: Node on your machine (best for development)

Prerequisites: **Node 20+** (22 recommended), **npm 10+**, and PostgreSQL 16 (via `docker compose up -d db mailpit`, or a local install).

```bash
npm install                                  # installs both workspaces
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up -d db mailpit              # Postgres :5432, Mailpit :8025/:1025

cd backend
npx prisma generate                          # generates the typed Prisma client
npx prisma migrate deploy                    # applies prisma/migrations
npm run prisma:seed                          # demo users + presets (optional)
npm run dev                                  # API on http://localhost:4000

# in a second terminal
cd frontend && npm run dev                   # http://localhost:5173 (proxies /api → :4000)
```

### Demo accounts (after seeding)

Every demo account uses the password **`ReefDemo2026!`**.

| Email | Scenario |
|---|---|
| `home@reef.local` | Home, single tank, goes straight to the aquarium dashboard |
| `multi@reef.local` | Home, three tanks (one without a controller) |
| `admin@aquarium.example` | Enterprise: 2 sites, 4 tanks, one offline controller, User Management |

You can also register a new account. The verification email shows up in Mailpit (http://localhost:8025). If `SMTP_HOST` is empty, it's printed to the API log instead.

---

## 9. Testing

| Layer | Tool | Command | Covers |
|---|---|---|---|
| Backend unit | Jest + ts-jest | `npm test --workspace backend` | Power formula, AB+ values, validation, schedule validation, simulator onboarding and errors, stub adapters, voice parser, AES-GCM, RBAC |
| Backend integration | Jest + Supertest + real Postgres | `npm run test:integration --workspace backend` | Register → verify → login, refresh rotation and reuse detection, tenant isolation, onboarding, save/apply, shared-profile 409 + fork, preset immutability, voice confirm, dashboard |
| Frontend | Jest + React Testing Library | `npm test --workspace frontend` | Domain mirror vs. spec, slider range and step, manual entry clamping, blur commit |
| End-to-end | Playwright (desktop Chrome + iPhone 14) | `npm run test:e2e` | Bad login, single-tank dashboard, 9-channel apply, enterprise view, full onboarding with a Wi-Fi error |

Integration tests need a separate database:

```bash
createdb -h localhost -U reef reef_lighting_test
cd backend
DATABASE_URL=postgresql://reef:reef@localhost:5432/reef_lighting_test npx prisma migrate deploy
DATABASE_URL=postgresql://reef:reef@localhost:5432/reef_lighting_test npm run test:integration
```

E2E tests need the stack running and seeded (see `playwright.config.ts`). Run `npx playwright install` once to download browsers.

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, migrations, integration tests, frontend tests and the build on every push and PR, then runs E2E against the Docker Compose stack.

---

## 10. Deploying to production (step by step)

The app ships as **two containers**:

- `backend`: runs `prisma migrate deploy` on start, then the API on port 4000.
- `frontend`: nginx serving the SPA and proxying `/api` to the backend.

They need a **PostgreSQL 14+** database and an **SMTP** provider. **HTTPS is mandatory**: passkeys, Web Bluetooth and secure cookies all require it.

### Step 0: Decide where it runs

| Option | Good for | Pieces |
|---|---|---|
| **A. Single VM + Docker Compose** | Pilot, small business, home-lab | One VM (2 vCPU / 4 GB), Caddy or nginx for TLS, managed or containerized Postgres |
| **B. Managed PaaS** (Render, Railway, Fly.io, DigitalOcean App Platform) | Small team, minimal ops | Two services from the Dockerfiles + managed Postgres |
| **C. AWS** (ECS Fargate + RDS + ALB) | Enterprise scale, compliance | ECR, ECS services, RDS PostgreSQL (Multi-AZ), ALB with ACM cert, Secrets Manager, SES |

The steps below are written for **Option A**, with notes for B and C.

### Step 1: Prepare a domain and DNS

Choose a hostname, e.g. `app.reeflighting.com`, and create an **A record** pointing at the server's public IP (or a CNAME to your PaaS or load balancer).

### Step 2: Provision the server

```bash
# Ubuntu 24.04 example
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

### Step 3: Get the code

```bash
git clone <your-repo-url> /opt/reef-lighting && cd /opt/reef-lighting
```

### Step 4: Create production secrets

```bash
cp backend/.env.example backend/.env
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET (different value)
openssl rand -base64 32   # → MFA_ENCRYPTION_KEY (must decode to exactly 32 bytes)
openssl rand -base64 24   # → database password
```

Edit `backend/.env`:

```dotenv
NODE_ENV=production
PORT=4000
APP_URL=https://app.reeflighting.com
CORS_ORIGINS=https://app.reeflighting.com
DATABASE_URL=postgresql://reef:<db-password>@db:5432/reef_lighting?schema=public
JWT_ACCESS_SECRET=<generated>
JWT_REFRESH_SECRET=<generated>
MFA_ENCRYPTION_KEY=<generated>
REQUIRE_EMAIL_VERIFICATION=true
WEBAUTHN_RP_ID=app.reeflighting.com
WEBAUTHN_ORIGINS=https://app.reeflighting.com
SMTP_HOST=smtp.sendgrid.net        # or SES / Postmark / Mailgun
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<smtp-api-key>
MAIL_FROM="Reef Lighting <no-reply@reeflighting.com>"
IOT_ADAPTER=simulated
```

> 🔐 `chmod 600 backend/.env`. Never commit it; `.gitignore` already excludes it. On a PaaS or AWS, put these values in the platform's secret store instead of a file.
>
> ⚠️ Keep `MFA_ENCRYPTION_KEY` stable and backed up. Losing it locks every MFA user out of 2FA.

### Step 5: Create a production Compose override

Create `docker-compose.prod.yml`:

```yaml
services:
  db:
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports: !reset []            # do not expose Postgres publicly (Compose ≥ 2.24)
  mailpit:
    profiles: ["dev"]          # disabled in production
  backend:
    environment:
      DATABASE_URL: postgresql://reef:${DB_PASSWORD}@db:5432/reef_lighting?schema=public
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
    ports: !reset []            # reachable only through the frontend proxy
  frontend:
    ports: !override ["127.0.0.1:8080:80"]   # only the TLS proxy talks to it
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on: [frontend]
volumes:
  caddy_data:
```

Create `Caddyfile` (Caddy obtains and renews Let's Encrypt certificates automatically):

```
app.reeflighting.com {
  encode gzip
  reverse_proxy frontend:80
  header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
}
```

Create a root `.env` for Compose variable substitution:

```dotenv
DB_PASSWORD=<db-password>
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
```

### Step 6: Build and start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f backend      # expect: "API listening on :4000 … IoT transport: SIMULATED [SIMULATED]"
```

On every start the backend runs `prisma migrate deploy`, applying any pending migrations before it begins serving.

### Step 7: Verify

```bash
curl -s https://app.reeflighting.com/api/v1/meta/iot      # {"transport":"SIMULATED","simulated":true}
docker compose exec backend node -e "fetch('http://localhost:4000/health').then(r=>r.json()).then(console.log)"
```

Then in a browser:

1. Register at `https://app.reeflighting.com/register` and confirm the verification email arrives.
2. Sign in, turn on MFA, and add a passkey (tests HTTPS and RP ID).
3. Add a (simulated) controller, change a channel, and press **Apply**.

**Seed demo data only on non-production environments:** `docker compose exec backend node dist/scripts/seed.js`.

### Step 8: Backups, monitoring, updates

**Backups (cron on the host):**

```bash
0 3 * * * docker compose -f /opt/reef-lighting/docker-compose.yml exec -T db pg_dump -U reef reef_lighting | gzip > /var/backups/reef-$(date +\%F).sql.gz
```

Copy backups off the server (S3 or similar) and test a restore regularly.

**Health checks:** point uptime monitoring at `/api/v1/meta/iot`. The backend image also has a Docker `HEALTHCHECK` against `/health`, which checks the database.

**Logs:** the API logs JSON with pino; ship them to Loki, CloudWatch or Datadog. Sensitive fields are redacted.

**Updates:**

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Migrations run automatically. Take a database snapshot before releases that contain migrations.

### Option B notes: PaaS (Render, Railway, Fly.io)

1. Create a **managed PostgreSQL** instance and copy its connection string.
2. Create a **web service** from `backend/Dockerfile` (port 4000). Add every variable from step 4 with `DATABASE_URL` set to the managed database, and set the health check path to `/health`.
3. Create a second **web service** from `frontend/Dockerfile` (port 80). In `frontend/nginx.conf`, change `proxy_pass http://backend:4000;` to the backend's **internal** URL (e.g. `http://reef-backend:4000` on Render's private network).
   - Or deploy the frontend as a static site with `VITE_API_URL=https://api.yourdomain.com/api/v1`. If you do, also set `CORS_ORIGINS` and change the refresh cookie to `SameSite=None; Secure`, or keep frontend and API on the same site.
4. Attach your custom domain to the frontend service. The platform issues TLS.
5. Set `APP_URL`, `CORS_ORIGINS`, `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGINS` to the final domain.

### Option C notes: AWS reference

1. **ECR:** push the `reef-backend` and `reef-frontend` images (build in CI).
2. **RDS PostgreSQL 16:** Multi-AZ, encrypted, private subnets, automated backups and PITR.
3. **Secrets Manager:** store the JWT, MFA and SMTP secrets and `DATABASE_URL`, injected into the ECS task definition.
4. **ECS Fargate:** two services in private subnets; scale the backend to 2+ tasks (it is stateless).
5. **ALB + ACM:** HTTPS listener with `/api/*` → backend target group (health check `/health`) and `/*` → frontend. Redirect HTTP to HTTPS.
6. **SES** for email (verify the domain; request production access).
7. **CloudWatch** logs and alarms (5xx rate, target health, RDS CPU and storage).
8. **WAF** on the ALB, with rate-based rules for `/api/v1/auth/*`.
9. **Phase 5:** add **AWS IoT Core** (managed MQTT with per-device X.509 certificates and device shadows), which maps directly onto `desiredState` / `reportedState`.

### Production checklist

- [ ] HTTPS everywhere, HSTS enabled
- [ ] Unique 32+ character JWT secrets; MFA key backed up in a secrets manager
- [ ] `NODE_ENV=production` (secure cookies)
- [ ] `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGINS` / `APP_URL` / `CORS_ORIGINS` match the real domain
- [ ] Postgres not publicly exposed; automated backups and a tested restore
- [ ] Real SMTP with SPF, DKIM and DMARC for the sending domain
- [ ] Demo seed **not** run in production
- [ ] Uptime monitor and log shipping configured
- [ ] UI and docs make clear that controllers are simulated until real adapters ship

---

## 11. Configuration reference

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables secure cookies |
| `PORT` | `4000` | API port |
| `APP_URL` | `http://localhost:5173` | Used in email links |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | ≥ 32 characters each; the app refuses to boot otherwise |
| `ACCESS_TOKEN_TTL` | `15m` | Access JWT lifetime |
| `REFRESH_TOKEN_TTL_DAYS` / `REMEMBER_ME_TTL_DAYS` | `1` / `30` | Session lifetimes |
| `MFA_ENCRYPTION_KEY` | — | Base64 of exactly 32 bytes |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | Block login until verified |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGINS` | `localhost` / `Reef Lighting` / `http://localhost:5173` | Must match the browser origin |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | — | Leave `SMTP_HOST` empty to log emails instead |
| `IOT_ADAPTER` | `simulated` | `ble`, `wifi` and `mqtt` are stubs that return 501 |
| `SIM_FAILURE_RATE` | `0` | 0–1 random failure probability for the simulator |
| `MQTT_URL` | — | Reserved for Phase 5 |
| `VITE_API_URL` (frontend, build time) | `/api/v1` | Keep the default behind the nginx proxy |

---

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| Backend exits with `Invalid environment configuration` | A required variable is missing or too short; the log names it. |
| `@prisma/client did not initialize yet` | Run `npx prisma generate` in `backend/` (Docker builds do this automatically). |
| Login says "Please confirm your email" | Open Mailpit (http://localhost:8025) or the API log for the link, or click **Resend link**. |
| Refresh / "remember me" doesn't stick in dev | Use the Vite dev server (`:5173`), which proxies `/api` so the cookie stays same-origin. |
| Passkey button fails with `SecurityError` | The page must be HTTPS (or localhost), and `WEBAUTHN_RP_ID` must equal the hostname. |
| Apply returns 207 / alert "Controller is offline" | Expected for the `-OFFLINE` simulated device; the change stays `PENDING`. |
| `501 NOT_IMPLEMENTED` from device endpoints | `IOT_ADAPTER` is not `simulated`; real transports aren't built yet. |
| `prisma migrate dev` reports drift | The bundled initial migration was written by hand to match `schema.prisma`. On a fresh dev database run `npx prisma migrate reset`. If drift remains, regenerate it with `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261121000000_init/migration.sql`. |

---

## 13. Roadmap and known limitations

**Next (Phase 5: scheduling and sync)**

- Scheduler editor UI (per-channel timeline, ramp curves, overrides) on top of the existing API
- MQTT adapter: topics `reef/{orgId}/{deviceId}/desired|reported|telemetry`, retained desired state, per-device credentials
- Real BLE provisioning (Web Bluetooth plus a React Native app for iOS) and a local LAN API with mDNS discovery
- Controller firmware contract: flash-stored profile and schedule, RTC with NTP sync, signed OTA updates

**Then (Phase 6: enterprise)**

- Invitations and role editing; per-site role scoping
- Bulk apply across tanks and sites; fleet firmware management
- Alert rules and notifications (email, push, Slack); telemetry retention and roll-ups
- SSO (SAML/OIDC) for enterprise organizations

**Known limitations in this release**

- All device communication is **simulated**. Simulated controllers revive as "online" after an API restart.
- Presets other than AB+ are reasonable starting values, not lab-validated spectra.
- MFA has no recovery codes yet; an admin has to reset it.
- The voice assistant is a typed preview with a rule-based parser. It integrates with no voice platform yet.
- `frontend/src/domain/channels.ts` duplicates the backend constants for instant UI feedback. Unit tests on both sides pin the spec values. Move them to a shared package if the constants grow.
#   R e e f - L i g h t i n g  
 