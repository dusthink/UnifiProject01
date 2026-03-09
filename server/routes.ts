import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireAdmin, hashPassword, comparePasswords } from "./auth";
import { UnifiClient, getUnifiClient, clearClientCache } from "./unifi";
import { insertCommunitySchema, insertBuildingSchema, insertUnitSchema, insertDeviceSchema, insertUnitDevicePortSchema, insertNetworkSchema, loginSchema, registerSchema } from "@shared/schema";
import passport from "passport";
import { randomBytes } from "crypto";

function parseSubnet(cidr: string): { start: number; end: number } | null {
  const match = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
  if (!match) return null;
  const octets = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
  if (octets.some(o => o < 0 || o > 255)) return null;
  const bits = parseInt(match[5]);
  if (bits < 1 || bits > 30) return null;
  const ip = ((octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
  const mask = (~0 << (32 - bits)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { start: network, end: broadcast };
}

function findSubnetOverlap(newSubnet: string, existingNetworks: { name: string; ipSubnet: string | null }[]): { name: string; ipSubnet: string } | null {
  const newRange = parseSubnet(newSubnet);
  if (!newRange) return null;
  for (const net of existingNetworks) {
    if (!net.ipSubnet) continue;
    const existingRange = parseSubnet(net.ipSubnet);
    if (!existingRange) continue;
    if (newRange.start <= existingRange.end && newRange.end >= existingRange.start) {
      return { name: net.name, ipSubnet: net.ipSubnet };
    }
  }
  return null;
}

async function getClientForCommunity(communityId: string): Promise<{ client: UnifiClient; siteId: string } | null> {
  const community = await storage.getCommunity(communityId);
  if (!community?.controllerId) return null;
  const controller = await storage.getController(community.controllerId);
  if (!controller) return null;
  const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
  return { client, siteId: community.unifiSiteId || "default" };
}

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

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { email, password, displayName, tosAccepted } = parsed.data;
      const inviteToken = req.body.inviteToken as string | undefined;

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(email);
      if (existingUsername) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      let role: "admin" | "tenant" = "admin";
      let unitId: string | undefined;

      if (inviteToken) {
        const invite = await storage.getInviteTokenByToken(inviteToken);
        if (!invite) {
          return res.status(400).json({ message: "Invalid invite link" });
        }
        if (invite.usedAt) {
          return res.status(400).json({ message: "This invite link has already been used" });
        }
        if (new Date() > invite.expiresAt) {
          return res.status(400).json({ message: "This invite link has expired" });
        }
        if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({ message: "This invite link was sent to a different email address" });
        }
        role = "tenant";
        unitId = invite.unitId;
      }

      const hashed = await hashPassword(password);
      const user = await storage.createUser({
        username: email,
        email,
        password: hashed,
        role,
        unitId,
        displayName,
        tosAcceptedAt: new Date(),
      });

      if (inviteToken) {
        const invite = await storage.getInviteTokenByToken(inviteToken);
        if (invite) await storage.markInviteTokenUsed(invite.id);
      }

      req.logIn(user, (err) => {
        if (err) return res.status(500).json({ message: "Account created but login failed" });
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
    } catch (error: any) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.get("/api/auth/google", (req: any, res, next) => {
    if (req.query.inviteToken) {
      req.session.pendingInviteToken = req.query.inviteToken;
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login?error=google_auth_failed" }),
    async (req: any, res) => {
      const user = req.user as any;
      const pendingToken = req.session?.pendingInviteToken;
      delete req.session.pendingInviteToken;

      if (pendingToken) {
        const invite = await storage.getInviteTokenByToken(pendingToken);
        if (invite && !invite.usedAt && new Date() <= invite.expiresAt) {
          if (invite.email && user.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
            return res.redirect("/login?error=google_auth_failed");
          }
          await storage.updateUser(user.id, { role: "tenant", unitId: invite.unitId });
          await storage.markInviteTokenUsed(invite.id);
          return res.redirect("/tenant");
        }
      }

      if (user.role === "tenant") {
        res.redirect("/tenant");
      } else {
        res.redirect("/admin");
      }
    }
  );

  app.get("/api/invite/:token", async (req, res) => {
    const invite = await storage.getInviteTokenByToken(req.params.token);
    if (!invite) {
      return res.status(404).json({ message: "Invalid invite link" });
    }
    if (invite.usedAt) {
      return res.status(400).json({ message: "This invite link has already been used" });
    }
    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ message: "This invite link has expired" });
    }

    const unit = await storage.getUnit(invite.unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    const building = await storage.getBuilding(unit.buildingId);
    const community = building ? await storage.getCommunity(building.communityId) : null;

    res.json({
      valid: true,
      email: invite.email,
      unitNumber: unit.unitNumber,
      buildingName: building?.name,
      communityName: community?.name,
    });
  });

  app.post("/api/admin/invite", requireAdmin, async (req, res) => {
    const { unitId, email } = req.body;
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required" });
    }

    const unit = await storage.getUnit(unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await storage.createInviteToken({
      token,
      unitId,
      email: email || null,
      expiresAt,
      createdBy: (req.user as any).id,
    });

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "http://localhost:5000";

    const inviteUrl = `${baseUrl}/register/tenant?token=${token}`;

    res.status(201).json({ invite, inviteUrl });
  });

  app.get("/api/admin/invites", requireAdmin, async (req, res) => {
    const invites = await storage.getPendingInvites();
    const enriched = await Promise.all(
      invites.map(async (inv) => {
        const unit = await storage.getUnit(inv.unitId);
        const building = unit ? await storage.getBuilding(unit.buildingId) : null;
        const community = building ? await storage.getCommunity(building.communityId) : null;
        return {
          ...inv,
          unitNumber: unit?.unitNumber,
          buildingName: building?.name,
          communityName: community?.name,
        };
      })
    );
    res.json(enriched);
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

  app.post("/api/auth/accept-tos", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user as any;
    await storage.updateUser(user.id, { tosAcceptedAt: new Date() });
    const updated = await storage.getUser(user.id);
    if (!updated) return res.status(404).json({ message: "User not found" });
    const { password, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.get("/api/admin/tenant-users", requireAdmin, async (req, res) => {
    const tenants = await storage.getUsersByRole("tenant");
    const safeTenants = tenants.map(({ password, ...rest }) => rest);
    res.json(safeTenants);
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
    const parsed = insertBuildingSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const building = await storage.updateBuilding(req.params.id, parsed.data);
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
    const data = { ...parsed.data, tenantName: null as string | null, tenantEmail: null as string | null | undefined };
    if (data.tenantId) {
      const tenant = await storage.getUser(data.tenantId);
      if (!tenant || tenant.role !== "tenant") {
        return res.status(400).json({ message: "Invalid tenant: user not found or is not a tenant" });
      }
      data.tenantName = tenant.displayName || tenant.username;
      data.tenantEmail = tenant.email || undefined;
    }
    if (data.networkId) {
      const network = await storage.getNetwork(data.networkId);
      if (!network) {
        return res.status(400).json({ message: "Invalid network: network not found" });
      }
      data.vlanId = network.vlanId;
    }
    const unit = await storage.createUnit(data);
    res.status(201).json(unit);
  });

  app.patch("/api/units/:id", requireAdmin, async (req, res) => {
    const updateData = { ...req.body };
    delete updateData.tenantName;
    delete updateData.tenantEmail;
    if ("tenantId" in updateData) {
      if (updateData.tenantId) {
        const tenant = await storage.getUser(updateData.tenantId);
        if (!tenant || tenant.role !== "tenant") {
          return res.status(400).json({ message: "Invalid tenant: user not found or is not a tenant" });
        }
        updateData.tenantName = tenant.displayName || tenant.username;
        updateData.tenantEmail = tenant.email || null;
      } else {
        updateData.tenantId = null;
        updateData.tenantName = null;
        updateData.tenantEmail = null;
      }
    }
    if ("networkId" in updateData) {
      if (updateData.networkId) {
        const network = await storage.getNetwork(updateData.networkId);
        if (!network) {
          return res.status(400).json({ message: "Invalid network: network not found" });
        }
        updateData.vlanId = network.vlanId;
      } else {
        updateData.networkId = null;
      }
    }
    const unit = await storage.updateUnit(req.params.id, updateData);
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

  app.get("/api/controllers", requireAdmin, async (req, res) => {
    const result = await storage.getControllers();
    const safe = result.map(({ password, ...rest }) => rest);
    res.json(safe);
  });

  app.get("/api/controllers/:id", requireAdmin, async (req, res) => {
    const controller = await storage.getController(req.params.id);
    if (!controller) return res.status(404).json({ message: "Controller not found" });
    const { password, ...safe } = controller;
    res.json(safe);
  });

  app.post("/api/controllers", requireAdmin, async (req, res) => {
    const { name, url, username, password } = req.body;
    if (!name || !url || !username || !password) {
      return res.status(400).json({ message: "Name, URL, username, and password are required" });
    }
    const controller = await storage.createController({ name, url, username, password });
    const { password: _, ...safe } = controller;
    res.status(201).json(safe);
  });

  app.patch("/api/controllers/:id", requireAdmin, async (req, res) => {
    const controller = await storage.updateController(req.params.id, req.body);
    if (!controller) return res.status(404).json({ message: "Controller not found" });
    clearClientCache(req.params.id);
    const { password, ...safe } = controller;
    res.json(safe);
  });

  app.delete("/api/controllers/:id", requireAdmin, async (req, res) => {
    clearClientCache(req.params.id);
    const allCommunities = await storage.getCommunities();
    for (const comm of allCommunities) {
      if (comm.controllerId === req.params.id) {
        await storage.updateCommunity(comm.id, { controllerId: null });
      }
    }
    await storage.deleteController(req.params.id);
    res.status(204).end();
  });

  app.post("/api/controllers/test-credentials", requireAdmin, async (req, res) => {
    const { url, username, password } = req.body;
    if (!url || !username || !password) {
      return res.status(400).json({ success: false, message: "URL, username, and password are required" });
    }
    const client = new UnifiClient(url, username, password);
    const result = await client.testConnection();
    res.json(result);
  });

  app.post("/api/controllers/:id/test", requireAdmin, async (req, res) => {
    const controller = await storage.getController(req.params.id);
    if (!controller) return res.status(404).json({ message: "Controller not found" });

    const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
    const result = await client.testConnection();

    if (result.success) {
      const sysInfo = result.systemInfo || {};
      const updateData: any = {
        isVerified: true,
        lastConnectedAt: new Date(),
        isUnifiOs: result.isUnifiOs || false,
      };

      if (result.isUnifiOs) {
        updateData.hardwareModel = sysInfo.hardware?.shortname || sysInfo.hardware?.name || null;
        updateData.firmwareVersion = sysInfo.firmwareVersion || sysInfo.version || null;
        updateData.hostname = sysInfo.name || sysInfo.hostname || null;
        updateData.macAddress = sysInfo.mac || sysInfo.hardware?.mac || null;
        updateData.uptimeSeconds = sysInfo.uptime ? Math.floor(sysInfo.uptime) : null;
      } else if (sysInfo) {
        updateData.hardwareModel = sysInfo.ubnt_device_type || sysInfo.model || null;
        updateData.firmwareVersion = sysInfo.version || null;
        updateData.hostname = sysInfo.hostname || null;
        updateData.uptimeSeconds = sysInfo.uptime ? Math.floor(Number(sysInfo.uptime)) : null;
      }

      await storage.updateController(controller.id, updateData);

      if (result.sites && result.sites.length > 0) {
        await storage.deleteSitesByController(controller.id);
        for (const site of result.sites) {
          await storage.createSite({
            controllerId: controller.id,
            unifiSiteId: site._id || site.name,
            name: site.name,
            description: site.desc || site.name,
            deviceCount: site.device_count || site.num_sta || 0,
            isDefault: site.attr_hidden_id === "default" || site.name === "default",
          });
        }
      }
    } else {
      await storage.updateController(controller.id, { isVerified: false } as any);
    }

    res.json(result);
  });

  app.get("/api/controllers/:id/sites", requireAdmin, async (req, res) => {
    const controller = await storage.getController(req.params.id);
    if (!controller) return res.status(404).json({ message: "Controller not found" });
    const dbSites = await storage.getSitesByController(controller.id);
    if (dbSites.length > 0) {
      return res.json(dbSites);
    }
    const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
    const liveSites = await client.getSites();
    res.json(liveSites);
  });

  app.get("/api/controllers/:id/devices/:siteId", requireAdmin, async (req, res) => {
    const controller = await storage.getController(req.params.id);
    if (!controller) return res.status(404).json({ message: "Controller not found" });
    const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
    const devices = await client.getDevices(req.params.siteId);
    res.json(devices);
  });

  app.get("/api/controllers/:id/networks/:siteId", requireAdmin, async (req, res) => {
    const controller = await storage.getController(req.params.id);
    if (!controller) return res.status(404).json({ message: "Controller not found" });
    const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
    const liveNetworks = await client.getNetworks(req.params.siteId);
    res.json(liveNetworks);
  });

  app.get("/api/networks/controller/:controllerId", requireAdmin, async (req, res) => {
    try {
      const controllerId = req.params.controllerId;
      const siteId = (req.query.siteId as string) || "default";
      const controller = await storage.getController(controllerId);
      if (!controller) return res.status(404).json({ message: "Controller not found" });

      const dbNetworks = await storage.getNetworksByController(controllerId);

      let liveNetworks: any[] = [];
      let liveFetchSucceeded = false;
      if (controller.isVerified) {
        try {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          liveNetworks = await client.getNetworks(siteId);
          liveFetchSucceeded = true;
        } catch (e: any) {
          console.error(`[networks] Failed to fetch live networks for controller ${controllerId}: ${e.message}`);
        }
      }

      if (liveFetchSucceeded) {
        const allDbByUnifiId = new Map(dbNetworks.filter(n => n.unifiNetworkId).map(n => [n.unifiNetworkId, n]));
        const siteDiscovered = dbNetworks.filter(n => !n.isManaged && n.siteId === siteId);
        const liveByUnifiId = new Map(liveNetworks.map(n => [n._id, n]));

        for (const live of liveNetworks) {
          if (allDbByUnifiId.has(live._id)) {
            const existing = allDbByUnifiId.get(live._id)!;
            if (!existing.isManaged) {
              const vlan = live.vlan_enabled ? (live.vlan || 0) : 0;
              if (existing.name !== live.name || existing.vlanId !== vlan || existing.ipSubnet !== (live.ip_subnet || null)) {
                await storage.updateNetwork(existing.id, {
                  name: live.name || existing.name,
                  vlanId: vlan,
                  ipSubnet: live.ip_subnet || null,
                  dhcpEnabled: live.dhcpd_enabled ?? existing.dhcpEnabled,
                  dhcpStart: live.dhcpd_start || null,
                  dhcpStop: live.dhcpd_stop || null,
                });
              }
            }
          } else {
            const vlan = live.vlan_enabled ? (live.vlan || 0) : 0;
            await storage.createNetwork({
              controllerId,
              name: live.name || `Network-${live._id.substring(0, 6)}`,
              vlanId: vlan,
              purpose: live.purpose || "corporate",
              ipSubnet: live.ip_subnet || null,
              dhcpEnabled: live.dhcpd_enabled ?? false,
              dhcpStart: live.dhcpd_start || null,
              dhcpStop: live.dhcpd_stop || null,
              unifiNetworkId: live._id,
              siteId,
              isManaged: false,
            });
          }
        }

        const staleDiscovered = siteDiscovered.filter(n => n.unifiNetworkId && !liveByUnifiId.has(n.unifiNetworkId));
        for (const stale of staleDiscovered) {
          await storage.deleteNetwork(stale.id);
        }
      }

      const updatedNetworks = await storage.getNetworksByControllerAndSite(controllerId, siteId);
      res.json(updatedNetworks);
    } catch (err: any) {
      console.error(`[networks] Error syncing networks: ${err.message}`);
      const fallback = await storage.getNetworksByControllerAndSite(req.params.controllerId, (req.query.siteId as string) || "default");
      res.json(fallback);
    }
  });

  app.get("/api/networks/:id", requireAdmin, async (req, res) => {
    const network = await storage.getNetwork(req.params.id);
    if (!network) return res.status(404).json({ message: "Network not found" });
    res.json(network);
  });

  app.post("/api/networks", requireAdmin, async (req, res) => {
    try {
      const parsed = insertNetworkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      const controller = await storage.getController(parsed.data.controllerId);
      if (!controller) return res.status(400).json({ message: "Controller not found" });

      const existingNetworks = await storage.getNetworksByController(parsed.data.controllerId);

      const duplicateVlan = existingNetworks.find(n => n.vlanId === parsed.data.vlanId);
      if (duplicateVlan) {
        return res.status(400).json({
          message: `VLAN ${parsed.data.vlanId} is already in use by network "${duplicateVlan.name}"${!duplicateVlan.isManaged ? " (controller-managed)" : ""}. Choose a different VLAN ID.`
        });
      }

      const duplicateName = existingNetworks.find(n => n.name.toLowerCase() === parsed.data.name.trim().toLowerCase());
      if (duplicateName) {
        return res.status(400).json({
          message: `A network named "${duplicateName.name}" already exists on this controller. Choose a different name.`
        });
      }

      const oct2 = Math.floor(parsed.data.vlanId / 256);
      const oct3 = parsed.data.vlanId % 256;
      const effectiveSubnet = parsed.data.ipSubnet || `10.${oct2}.${oct3}.1/25`;
      if (!parseSubnet(effectiveSubnet)) {
        return res.status(400).json({ message: `Invalid subnet format: "${effectiveSubnet}". Use CIDR notation like 10.0.1.1/25.` });
      }
      const overlap = findSubnetOverlap(effectiveSubnet, existingNetworks);
      if (overlap) {
        return res.status(400).json({
          message: `Subnet ${effectiveSubnet} overlaps with network "${overlap.name}" (${overlap.ipSubnet}). Choose a different subnet.`
        });
      }

      const siteId = parsed.data.siteId || "default";
      let unifiNetworkId: string | null = null;

      if (controller.isVerified) {
        const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
        const networkResult = await client.createNetwork(
          siteId,
          parsed.data.name,
          parsed.data.vlanId,
          parsed.data.purpose || "corporate",
          {
            ipSubnet: parsed.data.ipSubnet || undefined,
            dhcpEnabled: parsed.data.dhcpEnabled ?? true,
            dhcpStart: parsed.data.dhcpStart || undefined,
            dhcpStop: parsed.data.dhcpStop || undefined,
          }
        );
        unifiNetworkId = networkResult?.data?.[0]?._id || null;
        if (!unifiNetworkId) {
          return res.status(500).json({ message: "Failed to create network on UniFi controller. The controller did not return a network ID." });
        }
      }

      const network = await storage.createNetwork({
        ...parsed.data,
        unifiNetworkId,
        isManaged: true,
      });
      res.status(201).json(network);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to create network: ${err.message}` });
    }
  });

  app.post("/api/networks/bulk", requireAdmin, async (req, res) => {
    try {
      const { controllerId, namePrefix, subnetSize, dhcpEnabled, siteId: reqSiteId } = req.body;
      const count = typeof req.body.count === "number" ? req.body.count : parseInt(req.body.count);
      const vlanStart = typeof req.body.vlanStart === "number" ? req.body.vlanStart : parseInt(req.body.vlanStart);
      if (!controllerId || !namePrefix || !subnetSize) {
        return res.status(400).json({ message: "Missing required fields: controllerId, namePrefix, subnetSize" });
      }
      if (!Number.isInteger(count) || count < 1 || count > 200) {
        return res.status(400).json({ message: "Count must be an integer between 1 and 200" });
      }
      if (!Number.isInteger(vlanStart) || vlanStart < 1 || vlanStart > 4094) {
        return res.status(400).json({ message: "VLAN start must be an integer between 1 and 4094" });
      }
      const cidrBits = parseInt(subnetSize);
      if (![25, 26, 27, 28, 29].includes(cidrBits)) {
        return res.status(400).json({ message: "Subnet size must be one of: /25, /26, /27, /28, /29" });
      }

      const controller = await storage.getController(controllerId);
      if (!controller) return res.status(400).json({ message: "Controller not found" });

      const existingNetworks = await storage.getNetworksByController(controllerId);
      const existingVlans = new Set(existingNetworks.map(n => n.vlanId));
      const existingNames = new Set(existingNetworks.map(n => n.name.toLowerCase()));
      const siteId = reqSiteId || "default";

      const hostBits = 32 - cidrBits;
      const subnetBlockSize = 1 << hostBits;

      const networks: Array<{
        name: string; vlanId: number; ipSubnet: string;
        dhcpStart: string; dhcpStop: string; dhcpEnabled: boolean;
      }> = [];

      let currentSubnetIp = 0;
      {
        const firstVlan = parseInt(vlanStart);
        const oct2 = Math.floor(firstVlan / 256);
        const oct3 = firstVlan % 256;
        currentSubnetIp = ((10 << 24) | (oct2 << 16) | (oct3 << 8)) >>> 0;
      }

      const errors: string[] = [];

      for (let i = 0; i < count; i++) {
        const vlanId = parseInt(vlanStart) + i;
        if (vlanId > 4094) {
          errors.push(`VLAN ${vlanId} exceeds maximum (4094). Stopped at ${i} networks.`);
          break;
        }
        if (existingVlans.has(vlanId)) {
          errors.push(`VLAN ${vlanId} already exists, skipping.`);
          currentSubnetIp = (currentSubnetIp + subnetBlockSize) >>> 0;
          continue;
        }
        const name = `${namePrefix}${vlanId}`;
        if (existingNames.has(name.toLowerCase())) {
          errors.push(`Name "${name}" already exists, skipping.`);
          currentSubnetIp = (currentSubnetIp + subnetBlockSize) >>> 0;
          continue;
        }

        const gatewayIp = (currentSubnetIp + 1) >>> 0;
        const o1 = (gatewayIp >>> 24) & 0xFF;
        const o2 = (gatewayIp >>> 16) & 0xFF;
        const o3 = (gatewayIp >>> 8) & 0xFF;
        const o4 = gatewayIp & 0xFF;
        const ipSubnet = `${o1}.${o2}.${o3}.${o4}/${cidrBits}`;

        const dhcpStartIp = (currentSubnetIp + 2) >>> 0;
        const dhcpStopIp = (currentSubnetIp + subnetBlockSize - 2) >>> 0;
        const fmtIp = (ip: number) => `${(ip >>> 24) & 0xFF}.${(ip >>> 16) & 0xFF}.${(ip >>> 8) & 0xFF}.${ip & 0xFF}`;

        const overlap = findSubnetOverlap(ipSubnet, [...existingNetworks, ...networks.map(n => ({ name: n.name, ipSubnet: n.ipSubnet }))]);
        if (overlap) {
          errors.push(`Subnet ${ipSubnet} overlaps with "${overlap.name}", skipping VLAN ${vlanId}.`);
          currentSubnetIp = (currentSubnetIp + subnetBlockSize) >>> 0;
          continue;
        }

        networks.push({
          name, vlanId, ipSubnet,
          dhcpStart: fmtIp(dhcpStartIp),
          dhcpStop: fmtIp(dhcpStopIp),
          dhcpEnabled: dhcpEnabled ?? true,
        });

        existingVlans.add(vlanId);
        existingNames.add(name.toLowerCase());
        currentSubnetIp = (currentSubnetIp + subnetBlockSize) >>> 0;
      }

      const results: Array<{ name: string; vlanId: number; success: boolean; error?: string }> = [];

      for (const net of networks) {
        try {
          let unifiNetworkId: string | null = null;
          if (controller.isVerified) {
            const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
            const networkResult = await client.createNetwork(
              siteId, net.name, net.vlanId, "corporate",
              { ipSubnet: net.ipSubnet, dhcpEnabled: net.dhcpEnabled, dhcpStart: net.dhcpStart, dhcpStop: net.dhcpStop }
            );
            unifiNetworkId = networkResult?.data?.[0]?._id || null;
            if (!unifiNetworkId) {
              results.push({ name: net.name, vlanId: net.vlanId, success: false, error: "Controller did not return a network ID" });
              continue;
            }
          }

          await storage.createNetwork({
            controllerId, name: net.name, vlanId: net.vlanId, purpose: "corporate",
            ipSubnet: net.ipSubnet, dhcpEnabled: net.dhcpEnabled,
            dhcpStart: net.dhcpStart, dhcpStop: net.dhcpStop,
            unifiNetworkId, siteId, isManaged: true,
          });
          results.push({ name: net.name, vlanId: net.vlanId, success: true });
        } catch (err: any) {
          results.push({ name: net.name, vlanId: net.vlanId, success: false, error: err.message });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const skipped = count - networks.length;

      res.json({
        requested: count,
        total: networks.length,
        succeeded,
        failed,
        skipped,
        errors: [...errors, ...results.filter(r => !r.success).map(r => `${r.name}: ${r.error}`)],
        results,
      });
    } catch (err: any) {
      res.status(500).json({ message: `Bulk create failed: ${err.message}` });
    }
  });

  app.patch("/api/networks/:id", requireAdmin, async (req, res) => {
    const existing = await storage.getNetwork(req.params.id);
    if (!existing) return res.status(404).json({ message: "Network not found" });
    if (!existing.isManaged) return res.status(403).json({ message: "Cannot edit controller-managed networks. This network was discovered from the UniFi controller." });
    const partial = insertNetworkSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ message: partial.error.message });
    const network = await storage.updateNetwork(req.params.id, partial.data);
    if (!network) return res.status(404).json({ message: "Network not found" });
    res.json(network);
  });

  app.delete("/api/networks/:id", requireAdmin, async (req, res) => {
    try {
      const network = await storage.getNetwork(req.params.id);
      if (!network) return res.status(404).json({ message: "Network not found" });
      if (!network.isManaged) return res.status(403).json({ message: "Cannot delete controller-managed networks. This network exists on the UniFi controller and was not created from this interface." });

      if (network.unifiNetworkId) {
        const controller = await storage.getController(network.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          await client.deleteNetwork(network.siteId || "default", network.unifiNetworkId);
        }
      }

      await storage.deleteNetwork(req.params.id);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ message: `Failed to delete network: ${err.message}` });
    }
  });

  app.post("/api/units/:id/provision", requireAdmin, async (req, res) => {
    try {
      const unit = await storage.getUnit(req.params.id);
      if (!unit) return res.status(404).json({ message: "Unit not found" });

      const building = await storage.getBuilding(unit.buildingId);
      if (!building) return res.status(404).json({ message: "Building not found" });

      const ctx = await getClientForCommunity(building.communityId);
      if (!ctx) return res.status(400).json({ message: "No controller assigned to this community" });

      const { client, siteId } = ctx;

      let vlanId: number;
      if (unit.networkId) {
        const networkRecord = await storage.getNetwork(unit.networkId);
        if (!networkRecord) {
          return res.status(400).json({ message: "Assigned network not found. Please update the unit's network assignment." });
        }
        vlanId = networkRecord.vlanId;
      } else if (unit.vlanId) {
        vlanId = unit.vlanId;
      } else {
        return res.status(400).json({ message: "No network or VLAN assigned to this unit. Please assign a network before provisioning." });
      }

      const networkResult = await client.createNetwork(
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
        const wlanResult = await client.createWlan(
          siteId,
          unit.wifiSsid,
          unit.wifiPassword,
          networkId
        );
        wlanId = wlanResult?.data?.[0]?._id;
        if (!wlanId) {
          await client.deleteNetwork(siteId, networkId).catch(() => {});
          return res.status(500).json({ message: "Failed to create WLAN on UniFi controller - rolling back network" });
        }
      }

      const portAssignments = await storage.getPortAssignments(unit.id);
      for (const assignment of portAssignments) {
        const device = await storage.getDevice(assignment.deviceId);
        if (device?.unifiDeviceId) {
          await client.setPortProfile(siteId, device.unifiDeviceId, assignment.portNumber, vlanId);
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

      const ctx = await getClientForCommunity(building.communityId);
      if (!ctx) return res.status(400).json({ message: "No controller assigned to this community" });

      const { client, siteId } = ctx;

      if (unit.unifiWlanId) {
        await client.deleteWlan(siteId, unit.unifiWlanId);
      }
      if (unit.unifiNetworkId) {
        await client.deleteNetwork(siteId, unit.unifiNetworkId);
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
      if (!building) {
        return res.status(500).json({ message: "Could not resolve building for this unit" });
      }
      const ctx = await getClientForCommunity(building.communityId);
      if (!ctx) {
        return res.status(500).json({ message: "No controller assigned to this community - cannot update WiFi on controller" });
      }
      try {
        await ctx.client.updateWlanPassword(ctx.siteId, unit.unifiWlanId, newPassword);
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
    if (!building) return res.json([]);

    const ctx = await getClientForCommunity(building.communityId);
    if (!ctx) return res.json([]);

    try {
      const allClients = await ctx.client.getClientStats(ctx.siteId);
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
