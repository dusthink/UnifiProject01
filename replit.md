# UniFi MDU Network Manager

## Overview
A multi-dwelling unit (MDU) network management application that integrates with UniFi controllers. Provides admin and tenant portals for managing WiFi networks across apartment communities.

## Architecture
- **Frontend:** React + TypeScript with Vite, TanStack Query, wouter routing, shadcn/ui
- **Backend:** Express.js with session-based auth (passport-local + passport-google-oauth20), PostgreSQL via Drizzle ORM
- **UniFi Integration:** Class-based UnifiClient supporting multiple controllers with per-controller credentials and auth cookie caching

## Key Features
- **Admin Portal:** Community/building/unit management, device management, VLAN provisioning, WiFi configuration (PPSK or individual SSID), tenant account creation
- **Tenant Portal:** View WiFi settings, change WiFi password, view connected devices and usage statistics
- **Multi-Controller Support:** Add/test/manage multiple UniFi controllers independently, assign controllers to communities
- **UniFi Integration:** Create VLANs, configure port profiles, manage WLANs, discover devices (all per-controller)

## Authentication
- **Local auth:** Email/password registration and login (scrypt-hashed passwords)
- **Google OAuth 2.0:** Sign in / sign up with Google
- **Admin self-registration:** Open -- anyone creating account via main signup form or Google becomes admin
- **Tenant registration:** Invite-only -- admins generate invite links per unit, tenants use those links to register
- **Invite tokens:** 7-day expiry, single-use, optional email binding, stored in `invite_tokens` table
- Users table supports: username, email, password (nullable for Google-only accounts), googleId, avatarUrl
- Default admin seed: username `admin`, password `admin123`
- Google OAuth callback: `/api/auth/google/callback`
- Tenant registration page: `/register/tenant?token=xxx`

## Data Model
- Controllers (id, name, url, username, password, isVerified, lastConnectedAt)
- Users (admin/tenant roles, optional Google ID, email, avatar)
- InviteTokens (token, unitId, email, expiresAt, usedAt, createdBy)
- Communities (has controllerId FK) → Buildings → Units (hierarchical)
- Devices (UniFi switches/APs)
- UnitDevicePorts (port-to-unit assignments)

## Multi-Controller Architecture
- `controllers` table stores connection details for each UniFi controller
- `communities.controllerId` links a community to its controller
- `server/unifi.ts` exports `UnifiClient` class and `getUnifiClient(id, url, user, pass)` factory with per-controller cache
- `clearClientCache(id)` invalidates cached client when credentials change
- Provisioning/deprovisioning routes resolve controller from community → controller chain
- Controller passwords stored in plain text (future: encrypt at rest)

## Important Files
- `shared/schema.ts` - Database schema and types
- `server/routes.ts` - All API endpoints (controller CRUD, provisioning, tenant)
- `server/storage.ts` - Database CRUD operations (includes controller storage)
- `server/unifi.ts` - UniFi Controller API client (class-based, multi-controller)
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

## Default Admin Credentials
- Username: `admin`
- Password: `admin123`

## GitHub Repository
- Private repo: github.com/dusthink/unifi-mdu-manager
