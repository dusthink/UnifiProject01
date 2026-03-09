import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireAdmin, hashPassword, comparePasswords } from "./auth";
import * as unifi from "./unifi";
import { insertCommunitySchema, insertBuildingSchema, insertUnitSchema, insertDeviceSchema, insertUnitDevicePortSchema, loginSchema } from "@shared/schema";
import passport from "passport";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  await seedAdmin();

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  app.get("/api/communities", requireAdmin, async (req, res) => {
    const result = await storage.getCommunities();
    res.json(result);
  });

  app.get("/api/communities/:id", requireAdmin, async (req, res) => {
    const community = await storage.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ message: "Community not found" });
    res.json(community);
  });

  app.post("/api/communities", requireAdmin, async (req, res) => {
    const parsed = insertCommunitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const community = await storage.createCommunity(parsed.data);
    res.status(201).json(community);
  });

  app.patch("/api/communities/:id", requireAdmin, async (req, res) => {
    const community = await storage.updateCommunity(req.params.id, req.body);
    if (!community) return res.status(404).json({ message: "Community not found" });
    res.json(community);
  });

  app.delete("/api/communities/:id", requireAdmin, async (req, res) => {
    await storage.deleteCommunity(req.params.id);
    res.status(204).end();
  });

  app.get("/api/communities/:communityId/buildings", requireAdmin, async (req, res) => {
    const result = await storage.getBuildings(req.params.communityId);
    res.json(result);
  });

  app.get("/api/buildings/:id", requireAdmin, async (req, res) => {
    const building = await storage.getBuilding(req.params.id);
    if (!building) return res.status(404).json({ message: "Building not found" });
    res.json(building);
  });

  app.post("/api/buildings", requireAdmin, async (req, res) => {
    const parsed = insertBuildingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const building = await storage.createBuilding(parsed.data);
    res.status(201).json(building);
  });

  app.patch("/api/buildings/:id", requireAdmin, async (req, res) => {
    const building = await storage.updateBuilding(req.params.id, req.body);
    if (!building) return res.status(404).json({ message: "Building not found" });
    res.json(building);
  });

  app.delete("/api/buildings/:id", requireAdmin, async (req, res) => {
    await storage.deleteBuilding(req.params.id);
    res.status(204).end();
  });

  app.get("/api/buildings/:buildingId/units", requireAdmin, async (req, res) => {
    const result = await storage.getUnits(req.params.buildingId);
    res.json(result);
  });

  app.get("/api/units/:id", requireAuth, async (req, res) => {
    const unit = await storage.getUnit(req.params.id);
    if (!unit) return res.status(404).json({ message: "Unit not found" });
    const user = req.user as any;
    if (user.role === "tenant" && user.unitId !== unit.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(unit);
  });

  app.post("/api/units", requireAdmin, async (req, res) => {
    const parsed = insertUnitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const unit = await storage.createUnit(parsed.data);
    res.status(201).json(unit);
  });

  app.patch("/api/units/:id", requireAdmin, async (req, res) => {
    const unit = await storage.updateUnit(req.params.id, req.body);
    if (!unit) return res.status(404).json({ message: "Unit not found" });
    res.json(unit);
  });

  app.delete("/api/units/:id", requireAdmin, async (req, res) => {
    await storage.deleteUnit(req.params.id);
    res.status(204).end();
  });

  app.get("/api/devices", requireAdmin, async (req, res) => {
    const communityId = req.query.communityId as string | undefined;
    const result = await storage.getDevices(communityId);
    res.json(result);
  });

  app.get("/api/devices/:id", requireAdmin, async (req, res) => {
    const device = await storage.getDevice(req.params.id);
    if (!device) return res.status(404).json({ message: "Device not found" });
    res.json(device);
  });

  app.post("/api/devices", requireAdmin, async (req, res) => {
    const parsed = insertDeviceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const device = await storage.createDevice(parsed.data);
    res.status(201).json(device);
  });

  app.patch("/api/devices/:id", requireAdmin, async (req, res) => {
    const device = await storage.updateDevice(req.params.id, req.body);
    if (!device) return res.status(404).json({ message: "Device not found" });
    res.json(device);
  });

  app.delete("/api/devices/:id", requireAdmin, async (req, res) => {
    await storage.deleteDevice(req.params.id);
    res.status(204).end();
  });

  app.get("/api/units/:unitId/ports", requireAdmin, async (req, res) => {
    const result = await storage.getPortAssignments(req.params.unitId);
    res.json(result);
  });

  app.post("/api/port-assignments", requireAdmin, async (req, res) => {
    const parsed = insertUnitDevicePortSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const assignment = await storage.createPortAssignment(parsed.data);
    res.status(201).json(assignment);
  });

  app.delete("/api/port-assignments/:id", requireAdmin, async (req, res) => {
    await storage.deletePortAssignment(req.params.id);
    res.status(204).end();
  });

  app.post("/api/units/:id/provision", requireAdmin, async (req, res) => {
    try {
      const unit = await storage.getUnit(req.params.id);
      if (!unit) return res.status(404).json({ message: "Unit not found" });

      const building = await storage.getBuilding(unit.buildingId);
      if (!building) return res.status(404).json({ message: "Building not found" });

      const community = await storage.getCommunity(building.communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });

      const siteId = community.unifiSiteId || "default";
      const vlanId = unit.vlanId || 100;

      const networkResult = await unifi.createNetwork(
        siteId,
        `Unit-${unit.unitNumber}-VLAN${vlanId}`,
        vlanId
      );

      const networkId = networkResult?.data?.[0]?._id;
      if (!networkId) {
        return res.status(500).json({ message: "Failed to create network on UniFi controller - no network ID returned" });
      }

      let wlanId = null;

      if (unit.wifiMode === "individual" && unit.wifiSsid && unit.wifiPassword) {
        const wlanResult = await unifi.createWlan(
          siteId,
          unit.wifiSsid,
          unit.wifiPassword,
          networkId
        );
        wlanId = wlanResult?.data?.[0]?._id;
        if (!wlanId) {
          await unifi.deleteNetwork(siteId, networkId).catch(() => {});
          return res.status(500).json({ message: "Failed to create WLAN on UniFi controller - rolling back network" });
        }
      }

      const portAssignments = await storage.getPortAssignments(unit.id);
      for (const assignment of portAssignments) {
        const device = await storage.getDevice(assignment.deviceId);
        if (device?.unifiDeviceId) {
          await unifi.setPortProfile(siteId, device.unifiDeviceId, assignment.portNumber, vlanId);
        }
      }

      const updated = await storage.updateUnit(unit.id, {
        isProvisioned: true,
        unifiNetworkId: networkId,
        unifiWlanId: wlanId,
      });

      res.json({ message: "Unit provisioned successfully", unit: updated });
    } catch (error: any) {
      res.status(500).json({ message: `Provisioning failed: ${error.message}` });
    }
  });

  app.post("/api/units/:id/deprovision", requireAdmin, async (req, res) => {
    try {
      const unit = await storage.getUnit(req.params.id);
      if (!unit) return res.status(404).json({ message: "Unit not found" });

      const building = await storage.getBuilding(unit.buildingId);
      if (!building) return res.status(404).json({ message: "Building not found" });

      const community = await storage.getCommunity(building.communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });

      const siteId = community.unifiSiteId || "default";

      if (unit.unifiWlanId) {
        await unifi.deleteWlan(siteId, unit.unifiWlanId);
      }
      if (unit.unifiNetworkId) {
        await unifi.deleteNetwork(siteId, unit.unifiNetworkId);
      }

      const updated = await storage.updateUnit(unit.id, {
        isProvisioned: false,
        unifiNetworkId: null,
        unifiWlanId: null,
      });

      res.json({ message: "Unit deprovisioned successfully", unit: updated });
    } catch (error: any) {
      res.status(500).json({ message: `Deprovisioning failed: ${error.message}` });
    }
  });

  app.get("/api/unifi/test", requireAdmin, async (req, res) => {
    const result = await unifi.testConnection();
    res.json(result);
  });

  app.get("/api/unifi/sites", requireAdmin, async (req, res) => {
    const sites = await unifi.getSites();
    res.json(sites);
  });

  app.get("/api/unifi/devices/:siteId", requireAdmin, async (req, res) => {
    const devices = await unifi.getDevices(req.params.siteId);
    res.json(devices);
  });

  app.get("/api/unifi/networks/:siteId", requireAdmin, async (req, res) => {
    const networks = await unifi.getNetworks(req.params.siteId);
    res.json(networks);
  });

  app.get("/api/tenant/unit", requireAuth, async (req, res) => {
    const user = req.user as any;
    if (user.role !== "tenant" || !user.unitId) {
      return res.status(403).json({ message: "Tenant access only" });
    }
    const unit = await storage.getUnit(user.unitId);
    if (!unit) return res.status(404).json({ message: "Unit not found" });
    res.json({
      unitNumber: unit.unitNumber,
      wifiSsid: unit.wifiSsid,
      wifiPassword: unit.wifiPassword,
      wifiMode: unit.wifiMode,
      vlanId: unit.vlanId,
      isProvisioned: unit.isProvisioned,
    });
  });

  app.patch("/api/tenant/wifi-password", requireAuth, async (req, res) => {
    const user = req.user as any;
    if (user.role !== "tenant" || !user.unitId) {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const unit = await storage.getUnit(user.unitId);
    if (!unit) return res.status(404).json({ message: "Unit not found" });

    if (unit.unifiWlanId) {
      const building = await storage.getBuilding(unit.buildingId);
      const community = building ? await storage.getCommunity(building.communityId) : null;
      const siteId = community?.unifiSiteId || "default";

      try {
        await unifi.updateWlanPassword(siteId, unit.unifiWlanId, newPassword);
      } catch (error: any) {
        return res.status(500).json({ message: `Failed to update WiFi: ${error.message}` });
      }
    }

    await storage.updateUnit(user.unitId, { wifiPassword: newPassword });
    res.json({ message: "WiFi password updated successfully" });
  });

  app.get("/api/tenant/clients", requireAuth, async (req, res) => {
    const user = req.user as any;
    if (user.role !== "tenant" || !user.unitId) {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const unit = await storage.getUnit(user.unitId);
    if (!unit) return res.status(404).json({ message: "Unit not found" });

    const building = await storage.getBuilding(unit.buildingId);
    const community = building ? await storage.getCommunity(building.communityId) : null;
    const siteId = community?.unifiSiteId || "default";

    try {
      const allClients = await unifi.getClientStats(siteId);
      const vlanClients = allClients.filter((c: any) => c.vlan === unit.vlanId);
      const sanitized = vlanClients.map((c: any) => ({
        hostname: c.hostname || c.name || "Unknown",
        mac: c.mac,
        ip: c.ip,
        rxBytes: c.rx_bytes || 0,
        txBytes: c.tx_bytes || 0,
        uptime: c.uptime || 0,
        signal: c.signal || null,
        isWired: c.is_wired || false,
      }));
      res.json(sanitized);
    } catch {
      res.json([]);
    }
  });

  app.post("/api/admin/create-tenant", requireAdmin, async (req, res) => {
    const { username, password, unitId, displayName } = req.body;
    if (!username || !password || !unitId) {
      return res.status(400).json({ message: "Username, password, and unitId are required" });
    }

    const existing = await storage.getUserByUsername(username);
    if (existing) return res.status(409).json({ message: "Username already exists" });

    const hashed = await hashPassword(password);
    const user = await storage.createUser({
      username,
      password: hashed,
      role: "tenant",
      unitId,
      displayName: displayName || username,
    });

    const { password: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  });

  return httpServer;
}

async function seedAdmin() {
  const existing = await storage.getUserByUsername("admin");
  if (!existing) {
    const hashed = await hashPassword("admin123");
    await storage.createUser({
      username: "admin",
      password: hashed,
      role: "admin",
      displayName: "Administrator",
    });
    console.log("Default admin created: admin / admin123");
  }
}
