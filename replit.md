# UniFi MDU Network Manager

## Overview
A multi-dwelling unit (MDU) network management application that integrates with UniFi controllers. Provides admin and tenant portals for managing WiFi networks across apartment communities.

## Architecture
- **Frontend:** React + TypeScript with Vite, TanStack Query, wouter routing, shadcn/ui
- **Backend:** Express.js with session-based auth (passport-local + passport-google-oauth20), PostgreSQL via Drizzle ORM
- **UniFi Integration:** Class-based UnifiClient supporting both UniFi OS (UDM/UDR/Cloud Gateway) and classic controllers, with per-controller credentials and auth cookie caching

## Key Features
- **Admin Portal:** Community/building/unit management, device management, network/VLAN management per controller, VLAN provisioning, WiFi configuration (PPSK or individual SSID), tenant account creation
- **Tenant Portal:** View WiFi settings, change WiFi password, view connected devices and usage statistics
- **Multi-Controller Support:** Add/edit/test/manage multiple UniFi controllers, auto-detect UniFi OS vs classic, show hardware model/firmware/uptime, persist discovered sites
- **Hierarchical Navigation:** Controller → Sites → Networks drill-down on Controllers page; networks are scoped per site
- **UniFi Integration:** Create VLANs (single or bulk), configure port profiles, manage WLANs, discover devices (all per-controller, per-site)
- **Bulk Network Creation:** Create up to 200 VLAN networks at once with configurable VLAN range start, name prefix, subnet size (/25–/29), and DHCP toggle. Live preview table before committing. Skips duplicates gracefully.

## Authentication
- **Local auth:** Email/password registration and login (scrypt-hashed passwords)
- **Google OAuth 2.0:** Sign in / sign up with Google
- **Admin self-registration:** Open -- anyone creating account via main signup form or Google becomes admin
- **Tenant registration:** Invite-only -- admins generate invite links per unit, tenants use those links to register
- **Invite tokens:** 7-day expiry, single-use, optional email binding, stored in `invite_tokens` table
- **Terms of Service (TOS):** Required checkbox on both admin and tenant registration forms; links to `/terms` page; `tosAcceptedAt` timestamp saved on user creation
- Users table supports: username, email, password (nullable for Google-only accounts), googleId, avatarUrl, tosAcceptedAt
- Default admin seed: username `admin`, password `admin123`
- Google OAuth callback: `/api/auth/google/callback`
- Tenant registration page: `/register/tenant?token=xxx`

## Data Model
- Controllers (id, name, url, username, password, isVerified, lastConnectedAt, isUnifiOs, hardwareModel, firmwareVersion, hostname, macAddress, uptimeSeconds)
- Sites (id, controllerId, unifiSiteId, name, description, deviceCount, isDefault) — persisted from UniFi on successful test
- Users (admin/tenant roles, optional Google ID, email, avatar, tosAcceptedAt)
- InviteTokens (token, unitId, email, expiresAt, usedAt, createdBy)
- Networks (id, controllerId, name, vlanId, ipSubnet, dhcpEnabled, dhcpStart, dhcpStop, unifiNetworkId, siteId, isManaged) — VLAN networks per controller; isManaged=true for web-created, false for controller-discovered
- Communities (has controllerId FK, unifiSiteId) → Buildings (name, address, floors) → Units (hierarchical, tenantId FK to users, networkId FK to networks)
- Devices (UniFi switches/APs, linked to buildings)
- UnitDevicePorts (device-to-unit assignments for provisioning)

## Multi-Controller Architecture
- `controllers` table stores connection details + hardware info for each UniFi controller
- `sites` table persists discovered UniFi sites linked to controllers
- `communities.controllerId` links a community to its controller
- `server/unifi.ts` exports `UnifiClient` class with auto-detection of UniFi OS vs classic controllers
  - UniFi OS: login via `/api/auth/login`, API prefix `/proxy/network`, CSRF token handling
  - Classic: login via `/api/login`, no API prefix
  - `getUnifiClient(id, url, user, pass)` factory with per-controller cache
  - `clearClientCache(id)` invalidates cached client when credentials change
- On successful test: system info (model, firmware, hostname, MAC, uptime) saved to controller; sites synced to `sites` table
- Controller passwords stored in plain text (future: encrypt at rest)

## Important Files
- `shared/schema.ts` - Database schema and types
- `server/routes.ts` - All API endpoints (controller CRUD, provisioning, tenant)
- `server/storage.ts` - Database CRUD operations (includes controller + site storage)
- `server/unifi.ts` - UniFi Controller API client (class-based, multi-controller, proxy-aware)
- `server/auth.ts` - Authentication setup (local + Google OAuth)
- `client/src/App.tsx` - Main app with routing
- `client/src/lib/auth.tsx` - Auth context provider
- `client/src/pages/login.tsx` - Login/registration page
- `client/src/pages/admin/controllers.tsx` - Controller management page

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `PROXY_HOST` - Forward proxy IP address (env var)
- `PROXY_PORT` - Forward proxy port (env var)
- `PROXY_USERNAME` - Forward proxy auth username (secret)
- `PROXY_PASSWORD` - Forward proxy auth password (secret)

## Proxy Configuration
- All UniFi controller API requests are routed through an HTTP forward proxy via `node-fetch` + `https-proxy-agent`
- Configured in `server/unifi.ts` with shared agent; credentials trimmed and URL-encoded
- `NODE_TLS_REJECT_UNAUTHORIZED=0` set to accept self-signed certs on UniFi controllers
- If proxy env vars are missing, connections fall back to direct (no proxy)

## Default Admin Credentials
- Username: `admin`
- Password: `admin123`

## GitHub Repository
- Private repo: github.com/dusthink/unifi-mdu-manager
