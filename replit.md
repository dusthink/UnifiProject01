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
- **Hierarchical Navigation:** Controller → Sites → (Networks | Devices) drill-down on Controllers page; networks scoped per site, devices globally imported and available for unit assignment
- **UniFi Integration:** Create VLANs (single or bulk), configure port profiles, manage WLANs, discover devices (all per-controller, per-site)
- **Bulk Network Creation:** Create up to 200 VLAN networks at once with configurable VLAN range start, name prefix, subnet size (/25–/29), and DHCP toggle. Live preview table before committing. Skips duplicates gracefully.
- **Edit Functionality:** Networks, WiFi, and Devices can be edited via pencil icon buttons in the Actions column. Only Web UI-managed items (isManaged=true) show edit buttons for Networks and WiFi; controller-synced items show lock icons. Edits sync to UniFi controller. **Network edit dialog** includes: name, IP subnet (CIDR, with validation and overlap check), DHCP toggle with range start/stop, network isolation toggle (creates/deletes firewall rules transactionally), internet access toggle. Collapsible Advanced section: custom DNS toggle with DNS server 1/2, DHCP lease time, custom gateway toggle with gateway IP, domain name, IGMP snooping, and controller info panel. **WiFi edit dialog** includes: SSID name, security mode (WPA Personal/Open), WPA mode (WPA2/WPA3), band (2.4/5/both), PMF mode, AP group assignment, enabled/guest/hide SSID toggles, password. Collapsible Advanced section: Fast Roaming (802.11r), BSS Transition (802.11v), U-APSD, Proxy ARP, L2 Isolation, Group Rekey interval, DTIM settings, minimum data rate controls.
- **Cascading Network Deletion:** Deleting a network shows a confirmation dialog with all affected associations (WiFi networks with PPSK keys referencing this VLAN, standalone WLANs bound to this network, and units linked to it). On confirm, the backend removes PPSK keys from shared SSIDs (preserving the SSID), deletes standalone WLANs, unlinks units, then deletes the network from the controller. Pre-delete association check via GET /api/networks/:id/associations. Bulk delete also cascades.
- **AP Groups Management:** New "AP Groups" tab between WiFi and Devices. Lists controller AP groups, create/edit/delete groups with AP assignment. WiFi creation (single and bulk) includes "Broadcast On" selector with three modes: All APs (default), AP Group (select existing groups), or Specific APs (pick individual access points with name/MAC/model/status). Specific APs mode auto-creates a dedicated AP group. UniFi client supports both v2 API (`/v2/api/site/{siteId}/apgroups`) and legacy REST (`/rest/apgroup`) with automatic fallback.
- **Interactive PPSK Key Management:** In the WiFi edit dialog, the PPSK banner is clickable and expands to show all linked PPSK keys with network name, VLAN badge, and individual remove buttons. "Add Networks" panel shows available (unassigned) networks with checkboxes; selecting a network auto-generates a 12-char password with a regenerate button. Add/remove operations sync immediately to the UniFi controller via POST `/api/wifi-networks/:id/ppsk-keys` with `action: "add"|"remove"`.
- **Bulk WiFi Assignment:** Two-tab dialog from WiFi tab "Bulk WiFi" button. **PPSK tab**: create new PPSK SSID or add networks to existing PPSK — auto-generates unique per-network passwords mapped to VLANs. **Create SSIDs tab**: individual SSID per network with naming conventions (use network name, prefix+VLAN, custom prefix+name) and auto-generated passwords. Results show generated credentials table with copy buttons. Network filtering: WAN/Internet/VPN networks excluded; PPSK tab also excludes VLAN-0 networks. PPSK keys use `password` field (not `key`) per UniFi API. Bulk-created SSIDs default to `_Unassigned-APs` AP group (not broadcasting); results dialog shows amber banner; WiFi list shows "Not Broadcasting" badge for SSIDs on that group.
- **Network Sync:** Networks endpoint syncs with controller on each fetch. Discovered (non-managed) networks missing from controller are auto-deleted. Managed networks missing from controller get a red "Missing from Controller" badge in the UI for manual review/deletion. WiFi networks (both managed and discovered) missing from controller are auto-cleaned during sync. Network deletion gracefully handles controller-side failures (try-catch on all UniFi API calls).
- **Network Isolation:** "Isolate Network" toggle on both single and bulk network creation. Uses the controller's native `network_isolation_enabled` property — set directly on the network object via the REST API (`/rest/networkconf`). The controller handles creating/deleting zone-based firewall policies internally. DB stores `networkIsolation` boolean; green shield icon shown in networks table for isolated networks. Drift detection compares DB vs controller isolation state.

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
- Devices (UniFi switches/APs, globally imported from controllers; typed as switch/access_point/hybrid/gateway/other with port count; iconId for product images from static.ui.com; assigned to units via UnitDevicePorts)
- UnitDevicePorts (device-to-unit assignments for provisioning)

## Controller Backups
- **Tables:** `controller_backups` (stores backup file data as base64) and `controller_backup_settings` (enabled, schedule, consent tracking)
- **Consent Flow:** First-time enable or first manual backup shows security warning dialog; user must accept before any backup can proceed. Consent tracked with `consentAcceptedAt` / `consentAcceptedBy`
- **Retention:** Fixed cap of 14 backups per controller (oldest deleted when exceeded). Daily = 14 days, weekly = 14 weeks, monthly = 14 months retention
- **Scheduler:** 60-second interval checks `nextBackupAt` for all enabled settings; triggers backup, stores file, trims to 14 max, updates timestamps
- **Manual backup:** "Backup Now" button triggers immediate backup via UniFi API `cmd/backup`
- **Download:** Backups stored as base64 in DB, served as binary download via `/api/backups/:id/download`
- **Routes:** GET/PUT `/api/controllers/:id/backup-settings`, GET `/api/controllers/:id/backups`, POST `/api/controllers/:id/backups/trigger`, GET `/api/backups/:id/download`, DELETE `/api/backups/:id`

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
