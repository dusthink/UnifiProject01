# UniFi MDU Network Manager

## Overview
A multi-dwelling unit (MDU) network management application that integrates with UniFi controllers. Provides admin and tenant portals for managing WiFi networks across apartment communities.

## Architecture
- **Frontend:** React + TypeScript with Vite, TanStack Query, wouter routing, shadcn/ui
- **Backend:** Express.js with session-based auth (passport-local + passport-google-oauth20), PostgreSQL via Drizzle ORM
- **UniFi Integration:** Custom API client for UniFi Controller REST API

## Key Features
- **Admin Portal:** Community/building/unit management, device management, VLAN provisioning, WiFi configuration (PPSK or individual SSID), tenant account creation
- **Tenant Portal:** View WiFi settings, change WiFi password, view connected devices and usage statistics
- **UniFi Integration:** Create VLANs, configure port profiles, manage WLANs, discover devices

## Authentication
- **Local auth:** Email/password registration and login (bcrypt-hashed passwords)
- **Google OAuth 2.0:** Sign in / sign up with Google
- **Login page:** Toggle between Sign In and Create Account modes
- Users table supports: username, email, password (nullable for Google-only accounts), googleId, avatarUrl
- Default admin seed: username `admin`, password `admin123`
- Google OAuth callback: `/api/auth/google/callback`

## Data Model
- Users (admin/tenant roles, optional Google ID, email, avatar)
- Communities → Buildings → Units (hierarchical)
- Devices (UniFi switches/APs)
- UnitDevicePorts (port-to-unit assignments)

## Important Files
- `shared/schema.ts` - Database schema and types
- `server/routes.ts` - All API endpoints
- `server/storage.ts` - Database CRUD operations
- `server/unifi.ts` - UniFi Controller API client
- `server/auth.ts` - Authentication setup (local + Google OAuth)
- `client/src/App.tsx` - Main app with routing
- `client/src/lib/auth.tsx` - Auth context provider
- `client/src/pages/login.tsx` - Login/registration page

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `UNIFI_CONTROLLER_URL` - UniFi controller URL
- `UNIFI_USERNAME` - UniFi admin username
- `UNIFI_PASSWORD` - UniFi admin password

## Default Admin Credentials
- Username: `admin`
- Password: `admin123`

## GitHub Repository
- Private repo: github.com/dusthink/unifi-mdu-manager
