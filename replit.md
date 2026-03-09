# UniFi MDU Network Manager

## Overview
A multi-dwelling unit (MDU) network management application that integrates with UniFi controllers. Provides admin and tenant portals for managing WiFi networks across apartment communities.

## Architecture
- **Frontend:** React + TypeScript with Vite, TanStack Query, wouter routing, shadcn/ui
- **Backend:** Express.js with session-based auth (passport-local), PostgreSQL via Drizzle ORM
- **UniFi Integration:** Custom API client for UniFi Controller REST API

## Key Features
- **Admin Portal:** Community/building/unit management, device management, VLAN provisioning, WiFi configuration (PPSK or individual SSID), tenant account creation
- **Tenant Portal:** View WiFi settings, change WiFi password, view connected devices and usage statistics
- **UniFi Integration:** Create VLANs, configure port profiles, manage WLANs, discover devices

## Data Model
- Users (admin/tenant roles)
- Communities → Buildings → Units (hierarchical)
- Devices (UniFi switches/APs)
- UnitDevicePorts (port-to-unit assignments)

## Important Files
- `shared/schema.ts` - Database schema and types
- `server/routes.ts` - All API endpoints
- `server/storage.ts` - Database CRUD operations
- `server/unifi.ts` - UniFi Controller API client
- `server/auth.ts` - Authentication setup
- `client/src/App.tsx` - Main app with routing
- `client/src/lib/auth.tsx` - Auth context provider

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption key
- `UNIFI_CONTROLLER_URL` - UniFi controller URL
- `UNIFI_USERNAME` - UniFi admin username
- `UNIFI_PASSWORD` - UniFi admin password

## Default Admin Credentials
- Username: `admin`
- Password: `admin123`
