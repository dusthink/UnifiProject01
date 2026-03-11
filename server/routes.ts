import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireAdmin, hashPassword, comparePasswords } from "./auth";
import { UnifiClient, getUnifiClient, clearClientCache } from "./unifi";
import { insertCommunitySchema, insertBuildingSchema, insertUnitSchema, insertDeviceSchema, insertUnitDevicePortSchema, insertNetworkSchema, insertWifiNetworkSchema, loginSchema, registerSchema, type InsertWifiNetwork } from "@shared/schema";
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
    const oldUnit = await storage.getUnit(req.params.id);
    const unit = await storage.updateUnit(req.params.id, updateData);
    if (!unit) return res.status(404).json({ message: "Unit not found" });

    if (oldUnit && "unifiWlanId" in updateData && oldUnit.unifiWlanId !== unit.unifiWlanId) {
      const assignments = await storage.getPortAssignments(unit.id);
      for (const a of assignments) {
        const device = await storage.getDevice(a.deviceId);
        if (device && (device.deviceType === "access_point" || device.deviceType === "hybrid")) {
          if (oldUnit.unifiWlanId) await syncApToWlan(device, oldUnit, "remove");
          if (unit.unifiWlanId) await syncApToWlan(device, unit, "add");
        }
      }
    }

    res.json(unit);
  });

  app.delete("/api/units/:id", requireAdmin, async (req, res) => {
    const unit = await storage.getUnit(req.params.id);
    if (unit?.unifiWlanId) {
      const assignments = await storage.getPortAssignments(unit.id);
      for (const a of assignments) {
        const device = await storage.getDevice(a.deviceId);
        if (device) await syncApToWlan(device, unit, "remove");
      }
    }
    await storage.deletePortAssignmentsByUnit(req.params.id);
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
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string") return res.status(400).json({ message: "Name is required" });
      const device = await storage.updateDevice(req.params.id, { name: name.trim() });
      if (!device) return res.status(404).json({ message: "Device not found" });
      res.json(device);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to update device: ${err.message}` });
    }
  });

  app.delete("/api/devices/:id", requireAdmin, async (req, res) => {
    await storage.deleteDevice(req.params.id);
    res.status(204).end();
  });

  app.get("/api/units/:unitId/ports", requireAdmin, async (req, res) => {
    const result = await storage.getPortAssignments(req.params.unitId);
    res.json(result);
  });

  async function syncApToWlan(device: any, unit: any, action: "add" | "remove") {
    if (!device || !unit) return;
    const isAp = device.deviceType === "access_point" || device.deviceType === "hybrid";
    if (!isAp || !unit.unifiWlanId || !device.macAddress) return;

    try {
      const building = await storage.getBuilding(unit.buildingId);
      if (!building) return;
      const community = await storage.getCommunity(building.communityId);
      if (!community?.controllerId) return;
      const controller = await storage.getController(community.controllerId);
      if (!controller?.isVerified) return;

      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const siteId = community.unifiSiteId || "default";
      const wlan = await client.getWlanDetail(siteId, unit.unifiWlanId);
      if (!wlan) return;

      const mac = device.macAddress.toLowerCase();
      const apGroups = await client.getApGroups(siteId);
      const managedGroupName = `managed-${wlan.name}`;
      let managedGroup = apGroups.find((g: any) => g.name === managedGroupName);

      const unassignedGroup = apGroups.find((g: any) => g.name === "_Unassigned-APs");
      const unassignedGroupId = unassignedGroup?._id;

      if (action === "add") {
        let managedGroupId: string;
        if (!managedGroup) {
          const result = await client.createApGroup(siteId, managedGroupName, [mac]);
          managedGroupId = result?.data?.[0]?._id || result?._id;
          if (!managedGroupId) {
            console.log(`[unifi] Failed to create managed AP group "${managedGroupName}"`);
            return;
          }
          console.log(`[unifi] Created AP group "${managedGroupName}" with AP ${mac} for WLAN "${wlan.name}"`);
        } else {
          managedGroupId = managedGroup._id;
          const currentMacs: string[] = (managedGroup.device_macs || []).map((m: string) => m.toLowerCase());
          if (!currentMacs.includes(mac)) {
            const newMacs = [...(managedGroup.device_macs || []), mac];
            await client.updateApGroup(siteId, managedGroupId, { name: managedGroupName, device_macs: newMacs });
            console.log(`[unifi] Added AP ${mac} to AP group "${managedGroupName}" for WLAN "${wlan.name}"`);
          }
        }
        const currentApGroupIds = wlan.ap_group_ids || [];
        const needsUpdate = !currentApGroupIds.includes(managedGroupId) ||
          (unassignedGroupId && currentApGroupIds.includes(unassignedGroupId));
        if (needsUpdate) {
          const updatedIds = currentApGroupIds
            .filter((id: string) => id !== unassignedGroupId)
            .concat(currentApGroupIds.includes(managedGroupId) ? [] : [managedGroupId]);
          await client.updateWlan(siteId, unit.unifiWlanId, { ap_group_ids: updatedIds });
          if (unassignedGroupId && currentApGroupIds.includes(unassignedGroupId)) {
            console.log(`[unifi] Removed _Unassigned-APs group from WLAN "${wlan.name}" ap_group_ids`);
          }
        }
        await client.forceProvision(siteId, mac);
      } else if (action === "remove") {
        if (!managedGroup) return;

        const currentMacs: string[] = (managedGroup.device_macs || []).map((m: string) => m.toLowerCase());
        if (!currentMacs.includes(mac)) return;

        const otherAssignments = await storage.getPortAssignmentsByDevice(device.id);
        const otherUnitsWithSameWlan = await Promise.all(
          otherAssignments.map(async (a) => {
            if (a.unitId === unit.id) return false;
            const otherUnit = await storage.getUnit(a.unitId);
            return otherUnit?.unifiWlanId === unit.unifiWlanId;
          })
        );
        if (otherUnitsWithSameWlan.some(Boolean)) return;

        const updatedMacs = (managedGroup.device_macs || []).filter((m: string) => m.toLowerCase() !== mac);
        await client.updateApGroup(siteId, managedGroup._id, { name: managedGroupName, device_macs: updatedMacs });
        await client.forceProvision(siteId, mac);
        console.log(`[unifi] Removed AP ${mac} from AP group "${managedGroupName}" for WLAN "${wlan.name}"`);
      }
    } catch (err: any) {
      console.log(`[unifi] AP-WLAN sync (${action}) failed for device ${device.id}: ${err.message}`);
    }
  }

  app.post("/api/port-assignments", requireAdmin, async (req, res) => {
    const parsed = insertUnitDevicePortSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const assignment = await storage.createPortAssignment(parsed.data);

    const device = await storage.getDevice(assignment.deviceId);
    const unit = await storage.getUnit(assignment.unitId);
    await syncApToWlan(device, unit, "add");

    res.status(201).json(assignment);
  });

  app.delete("/api/port-assignments/:id", requireAdmin, async (req, res) => {
    const assignment = await storage.getPortAssignment(req.params.id);
    if (assignment) {
      const device = await storage.getDevice(assignment.deviceId);
      const unit = await storage.getUnit(assignment.unitId);
      await storage.deletePortAssignment(req.params.id);
      await syncApToWlan(device, unit, "remove");
    } else {
      await storage.deletePortAssignment(req.params.id);
    }
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

        const staleManagedIds = new Set(
          dbNetworks
            .filter(n => n.isManaged && n.unifiNetworkId && n.siteId === siteId && !liveByUnifiId.has(n.unifiNetworkId))
            .map(n => n.id)
        );

        const updatedNetworks = await storage.getNetworksByControllerAndSite(controllerId, siteId);
        return res.json(updatedNetworks.map(n => ({
          ...n,
          missingFromController: staleManagedIds.has(n.id),
        })));
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
        const wantIsolation = parsed.data.networkIsolation ?? false;
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
            networkIsolation: wantIsolation,
          }
        );
        unifiNetworkId = networkResult?.data?.[0]?._id || null;
        if (!unifiNetworkId) {
          return res.status(500).json({ message: "Failed to create network on UniFi controller. The controller did not return a network ID." });
        }

        const network = await storage.createNetwork({
          ...parsed.data,
          unifiNetworkId,
          isManaged: true,
          networkIsolation: wantIsolation,
        });
        return res.status(201).json(network);
      }

      const network = await storage.createNetwork({
        ...parsed.data,
        unifiNetworkId: null,
        isManaged: true,
      });
      res.status(201).json(network);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to create network: ${err.message}` });
    }
  });

  app.post("/api/networks/bulk", requireAdmin, async (req, res) => {
    try {
      const { controllerId, namePrefix, subnetSize, dhcpEnabled, siteId: reqSiteId, networkIsolation } = req.body;
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

      const errors: string[] = [];
      const fmtIp = (ip: number) => `${(ip >>> 24) & 0xFF}.${(ip >>> 16) & 0xFF}.${(ip >>> 8) & 0xFF}.${ip & 0xFF}`;

      for (let i = 0; i < count; i++) {
        const vlanId = parseInt(vlanStart) + i;
        if (vlanId > 4094) {
          errors.push(`VLAN ${vlanId} exceeds maximum (4094). Stopped at ${i} networks.`);
          break;
        }
        if (existingVlans.has(vlanId)) {
          errors.push(`VLAN ${vlanId} already exists, skipping.`);
          continue;
        }
        const name = `${namePrefix}${vlanId}`;
        if (existingNames.has(name.toLowerCase())) {
          errors.push(`Name "${name}" already exists, skipping.`);
          continue;
        }

        const oct2 = Math.floor(vlanId / 256);
        const oct3 = vlanId % 256;
        const subnetBase = ((10 << 24) | (oct2 << 16) | (oct3 << 8)) >>> 0;

        const gatewayIp = (subnetBase + 1) >>> 0;
        const ipSubnet = `${fmtIp(gatewayIp)}/${cidrBits}`;

        const dhcpStartIp = (subnetBase + 2) >>> 0;
        const dhcpStopIp = (subnetBase + subnetBlockSize - 2) >>> 0;

        const overlap = findSubnetOverlap(ipSubnet, [...existingNetworks, ...networks.map(n => ({ name: n.name, ipSubnet: n.ipSubnet }))]);
        if (overlap) {
          errors.push(`Subnet ${ipSubnet} overlaps with "${overlap.name}", skipping VLAN ${vlanId}.`);
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
      }

      const results: Array<{ name: string; vlanId: number; success: boolean; error?: string }> = [];

      for (const net of networks) {
        try {
          let unifiNetworkId: string | null = null;
          const wantIsolation = networkIsolation ?? false;
          if (controller.isVerified) {
            const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
            const networkResult = await client.createNetwork(
              siteId, net.name, net.vlanId, "corporate",
              { ipSubnet: net.ipSubnet, dhcpEnabled: net.dhcpEnabled, dhcpStart: net.dhcpStart, dhcpStop: net.dhcpStop, networkIsolation: wantIsolation }
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
            networkIsolation: wantIsolation,
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

  app.get("/api/networks/:id/details", requireAdmin, async (req, res) => {
    try {
      const network = await storage.getNetwork(req.params.id);
      if (!network) return res.status(404).json({ message: "Network not found" });
      let unifi: any = null;
      if (network.unifiNetworkId) {
        const controller = await storage.getController(network.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          const raw = await client.getNetworkDetail(network.siteId || "default", network.unifiNetworkId);
          if (raw) {
            unifi = {
              _id: raw._id,
              name: raw.name,
              purpose: raw.purpose,
              vlan: raw.vlan,
              vlan_enabled: raw.vlan_enabled,
              ip_subnet: raw.ip_subnet,
              dhcpd_enabled: raw.dhcpd_enabled,
              dhcpd_start: raw.dhcpd_start,
              dhcpd_stop: raw.dhcpd_stop,
              dhcpd_dns_enabled: raw.dhcpd_dns_enabled,
              dhcpd_leasetime: raw.dhcpd_leasetime,
              dhcpd_dns_1: raw.dhcpd_dns_1,
              dhcpd_dns_2: raw.dhcpd_dns_2,
              dhcpd_gateway_enabled: raw.dhcpd_gateway_enabled,
              dhcpd_gateway: raw.dhcpd_gateway,
              dhcpd_unifi_controller: raw.dhcpd_unifi_controller,
              domain_name: raw.domain_name,
              igmp_snooping: raw.igmp_snooping,
              networkgroup: raw.networkgroup,
              setting_preference: raw.setting_preference,
              ipv6_setting_preference: raw.ipv6_setting_preference,
              internet_access_enabled: raw.internet_access_enabled,
              network_isolation_enabled: raw.network_isolation_enabled,
            };
          }
        }
      }
      res.json({ local: network, unifi });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/networks/:id/sync-from-controller", requireAdmin, async (req, res) => {
    try {
      const network = await storage.getNetwork(req.params.id);
      if (!network) return res.status(404).json({ message: "Network not found" });
      if (!network.unifiNetworkId) return res.status(400).json({ message: "Network has no UniFi ID" });

      const controller = await storage.getController(network.controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not verified" });

      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const raw = await client.getNetworkDetail(network.siteId || "default", network.unifiNetworkId);
      if (!raw) return res.status(404).json({ message: "Network not found on controller" });

      const dbUpdates: any = {};
      if (raw.name !== undefined) dbUpdates.name = raw.name;
      if (raw.ip_subnet !== undefined) dbUpdates.ipSubnet = raw.ip_subnet;
      if (raw.dhcpd_enabled !== undefined) dbUpdates.dhcpEnabled = raw.dhcpd_enabled;
      if (raw.dhcpd_start !== undefined) dbUpdates.dhcpStart = raw.dhcpd_start;
      if (raw.dhcpd_stop !== undefined) dbUpdates.dhcpStop = raw.dhcpd_stop;
      if (raw.network_isolation_enabled !== undefined) dbUpdates.networkIsolation = raw.network_isolation_enabled;

      const updated = await storage.updateNetwork(req.params.id, dbUpdates);
      if (!updated) return res.status(404).json({ message: "Network not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to sync from controller: ${err.message}` });
    }
  });

  app.get("/api/wifi-networks/:id/details", requireAdmin, async (req, res) => {
    try {
      const wifi = await storage.getWifiNetwork(req.params.id);
      if (!wifi) return res.status(404).json({ message: "WiFi network not found" });
      let unifi: any = null;
      if (wifi.unifiWlanId) {
        const controller = await storage.getController(wifi.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          const raw = await client.getWlanDetail(wifi.siteId || "default", wifi.unifiWlanId);
          if (raw) {
            unifi = {
              _id: raw._id,
              name: raw.name,
              security: raw.security,
              wpa_mode: raw.wpa_mode,
              wpa3_transition: raw.wpa3_transition,
              wlan_band: raw.wlan_band,
              wlan_bands: raw.wlan_bands,
              enabled: raw.enabled,
              is_guest: raw.is_guest,
              hide_ssid: raw.hide_ssid,
              pmf_mode: raw.pmf_mode,
              ap_group_mode: raw.ap_group_mode,
              ap_group_ids: raw.ap_group_ids,
              broadcasting_aps: raw.broadcasting_aps,
              private_preshared_keys_enabled: raw.private_preshared_keys_enabled,
              ppsk_key_count: raw.private_preshared_keys?.length || 0,
              ppsk_keys: (raw.private_preshared_keys || []).map((k: any) => ({
                description: k.description || k.name || "",
                vlan: k.vlan || "0",
                networkconf_id: k.networkconf_id || "",
              })),
              networkconf_id: raw.networkconf_id,
              usergroup_id: raw.usergroup_id,
              mac_filter_enabled: raw.mac_filter_enabled,
              mac_filter_policy: raw.mac_filter_policy,
              uapsd_enabled: raw.uapsd_enabled,
              fast_roaming_enabled: raw.fast_roaming_enabled,
              proxy_arp: raw.proxy_arp,
              bss_transition: raw.bss_transition,
              l2_isolation: raw.l2_isolation,
              group_rekey: raw.group_rekey,
              dtim_mode: raw.dtim_mode,
              dtim_na: raw.dtim_na,
              dtim_ng: raw.dtim_ng,
              minrate_na_enabled: raw.minrate_na_enabled,
              minrate_ng_enabled: raw.minrate_ng_enabled,
              minrate_na_data_rate_kbps: raw.minrate_na_data_rate_kbps,
              minrate_ng_data_rate_kbps: raw.minrate_ng_data_rate_kbps,
              minrate_na_advertising_rates: raw.minrate_na_advertising_rates,
              minrate_ng_advertising_rates: raw.minrate_ng_advertising_rates,
              no2ghz_oui: raw.no2ghz_oui,
              minrate_na_beacon_rate_kbps: raw.minrate_na_beacon_rate_kbps,
              minrate_ng_beacon_rate_kbps: raw.minrate_ng_beacon_rate_kbps,
              radius_das_enabled: raw.radius_das_enabled,
              schedule_enabled: raw.schedule_enabled,
              schedule: raw.schedule,
              schedule_with_duration: raw.schedule_with_duration,
              iapp_enabled: raw.iapp_enabled,
              wpa3_enhanced_192: raw.wpa3_enhanced_192,
              wpa3_fast_roaming: raw.wpa3_fast_roaming,
              setting_preference: raw.setting_preference,
              vlan: raw.vlan,
              vlan_enabled: raw.vlan_enabled,
            };
          }
        }
      }
      res.json({ local: wifi, unifi });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/devices/:id/details", requireAdmin, async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.id);
      if (!device) return res.status(404).json({ message: "Device not found" });
      let unifi: any = null;
      let wlans: any[] = [];
      let apGroups: any[] = [];
      let networks: any[] = [];
      const controllerId = req.query.controllerId as string;
      const siteId = (req.query.siteId as string) || "default";
      if (device.macAddress && controllerId) {
        const controller = await storage.getController(controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          const raw = await client.getDeviceDetail(siteId, device.macAddress);
          if (raw) {
            console.log(`[debug-raw] config_network:`, JSON.stringify(raw.config_network), `mgmt_network_id:`, raw.mgmt_network_id, `dot1x_portctrl_enabled:`, raw.dot1x_portctrl_enabled, `network_override_enabled:`, raw.network_override_enabled, `switch_vlan_enabled:`, raw.switch_vlan_enabled);
            unifi = {
              name: raw.name,
              model: raw.model,
              type: raw.type,
              ip: raw.ip,
              mac: raw.mac,
              version: raw.version,
              state: raw.state,
              adopted: raw.adopted,
              uptime: raw.uptime,
              last_seen: raw.last_seen,
              satisfaction: raw.satisfaction,
              kernel_version: raw.kernel_version,
              serial: raw.serial,
              led_override: raw.led_override,
              port_table: raw.port_table || [],
              port_overrides: raw.port_overrides || [],
              switch_vlan_enabled: raw.switch_vlan_enabled ?? false,
            };
          }
          if (device.deviceType === "access_point" || device.deviceType === "hybrid") {
            const [allWlans, allApGroups] = await Promise.all([
              client.getWlans(siteId),
              client.getApGroups(siteId),
            ]);
            const deviceMacLower = device.macAddress.toLowerCase();
            const deviceApGroups = allApGroups.filter((g: any) =>
              g.device_macs?.some((m: string) => m.toLowerCase() === deviceMacLower)
            );
            const deviceApGroupIds = new Set(deviceApGroups.map((g: any) => g._id || g.id));
            wlans = allWlans.filter((w: any) => {
              if (w.ap_group_ids?.length > 0) {
                return w.ap_group_ids.some((id: string) => deviceApGroupIds.has(id));
              }
              const defaultGroup = allApGroups.find((g: any) => g.attr_no_delete === true);
              if (defaultGroup) {
                return defaultGroup.device_macs?.some((m: string) => m.toLowerCase() === deviceMacLower) ?? false;
              }
              return true;
            }).map((w: any) => ({
              _id: w._id,
              name: w.name,
              enabled: w.enabled,
              security: w.security,
              wpa_mode: w.wpa_mode,
              is_guest: w.is_guest,
              networkconf_id: w.networkconf_id,
            }));
            apGroups = deviceApGroups.map((g: any) => ({
              _id: g._id || g.id,
              name: g.name,
              device_count: g.device_macs?.length || 0,
            }));
          }
          if (device.deviceType === "switch" || device.deviceType === "hybrid") {
            const allNetworks = await client.getNetworks(siteId);
            networks = allNetworks.map((n: any) => ({
              _id: n._id,
              name: n.name,
              vlan: n.vlan,
              purpose: n.purpose,
            }));
          }
        }
      }
      res.json({ local: device, unifi, wlans, apGroups, networks });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/devices/:id/set-port-vlan", requireAdmin, async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.id);
      if (!device) return res.status(404).json({ message: "Device not found" });
      const { controllerId, siteId = "default", portIdx, nativeVlan } = req.body;
      if (!controllerId || portIdx == null || nativeVlan == null) {
        return res.status(400).json({ message: "controllerId, portIdx, and nativeVlan are required" });
      }
      if (!device.unifiDeviceId) return res.status(400).json({ message: "Device has no UniFi device ID" });
      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not verified" });
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      await client.setPortProfile(siteId, device.unifiDeviceId, device.macAddress, portIdx, nativeVlan);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/devices/:id/set-port-vlans", requireAdmin, async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.id);
      if (!device) return res.status(404).json({ message: "Device not found" });
      const { controllerId, siteId = "default", ports } = req.body;
      if (!controllerId || !Array.isArray(ports) || ports.length === 0) {
        return res.status(400).json({ message: "controllerId and ports array are required" });
      }
      for (const p of ports) {
        if (typeof p.portIdx !== "number" || typeof p.nativeVlan !== "number" || p.portIdx < 1 || p.nativeVlan < 1 || p.nativeVlan > 4094) {
          return res.status(400).json({ message: "Each port must have a valid portIdx (>=1) and nativeVlan (1-4094)" });
        }
      }
      if (!device.unifiDeviceId) return res.status(400).json({ message: "Device has no UniFi device ID" });
      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not verified" });
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      await client.setPortProfiles(siteId, device.unifiDeviceId, device.macAddress, ports.map((p: any) => ({ portIdx: p.portIdx, nativeVlan: p.nativeVlan })));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/devices/:id/set-switch-vlan", requireAdmin, async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.id);
      if (!device) return res.status(404).json({ message: "Device not found" });
      const { controllerId, siteId = "default", enabled } = req.body;
      if (!controllerId || typeof enabled !== "boolean") {
        return res.status(400).json({ message: "controllerId and enabled (boolean) are required" });
      }
      if (!device.unifiDeviceId) return res.status(400).json({ message: "Device has no UniFi device ID" });
      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not verified" });
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      await client.setSwitchVlanEnabled(siteId, device.unifiDeviceId, device.macAddress, enabled);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/devices/:id/set-port-enabled", requireAdmin, async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.id);
      if (!device) return res.status(404).json({ message: "Device not found" });
      const { controllerId, siteId = "default", ports } = req.body;
      if (!controllerId || !Array.isArray(ports) || ports.length === 0) {
        return res.status(400).json({ message: "controllerId and ports array are required" });
      }
      for (const p of ports) {
        if (typeof p.portIdx !== "number" || p.portIdx < 1 || typeof p.enabled !== "boolean") {
          return res.status(400).json({ message: "Each port must have a valid portIdx (>=1) and enabled (boolean)" });
        }
      }
      if (!device.unifiDeviceId) return res.status(400).json({ message: "Device has no UniFi device ID" });
      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not verified" });
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      await client.setPortEnabled(siteId, device.unifiDeviceId, device.macAddress, ports);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/networks/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getNetwork(req.params.id);
      if (!existing) return res.status(404).json({ message: "Network not found" });
      if (!existing.isManaged) return res.status(403).json({ message: "Cannot edit controller-managed networks. This network was discovered from the UniFi controller." });
      const partial = insertNetworkSchema.partial().safeParse(req.body);
      if (!partial.success) return res.status(400).json({ message: partial.error.message });

      if (partial.data.ipSubnet !== undefined && partial.data.ipSubnet !== null) {
        if (!parseSubnet(partial.data.ipSubnet)) {
          return res.status(400).json({ message: `Invalid subnet format: "${partial.data.ipSubnet}". Use CIDR notation like 10.0.1.1/25.` });
        }
        const existingNetworks = await storage.getNetworksByController(existing.controllerId);
        const otherNetworks = existingNetworks.filter(n => n.id !== existing.id);
        const overlap = findSubnetOverlap(partial.data.ipSubnet, otherNetworks);
        if (overlap) {
          return res.status(400).json({ message: `Subnet ${partial.data.ipSubnet} overlaps with network "${overlap.name}" (${overlap.ipSubnet}). Choose a different subnet.` });
        }
      }

      if (existing.unifiNetworkId) {
        const controller = await storage.getController(existing.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          const unifiUpdates: Record<string, any> = {};
          if (partial.data.name !== undefined) unifiUpdates.name = partial.data.name;
          if (partial.data.ipSubnet !== undefined) unifiUpdates.ip_subnet = partial.data.ipSubnet;
          if (partial.data.dhcpEnabled !== undefined) unifiUpdates.dhcpd_enabled = partial.data.dhcpEnabled;
          if (partial.data.dhcpStart !== undefined) unifiUpdates.dhcpd_start = partial.data.dhcpStart;
          if (partial.data.dhcpStop !== undefined) unifiUpdates.dhcpd_stop = partial.data.dhcpStop;

          const extra = req.body;
          if (extra.dhcpdDnsEnabled !== undefined) unifiUpdates.dhcpd_dns_enabled = extra.dhcpdDnsEnabled;
          if (extra.dhcpdDns1 !== undefined) unifiUpdates.dhcpd_dns_1 = extra.dhcpdDns1;
          if (extra.dhcpdDns2 !== undefined) unifiUpdates.dhcpd_dns_2 = extra.dhcpdDns2;
          if (extra.dhcpdLeasetime !== undefined) unifiUpdates.dhcpd_leasetime = extra.dhcpdLeasetime;
          if (extra.dhcpdGatewayEnabled !== undefined) unifiUpdates.dhcpd_gateway_enabled = extra.dhcpdGatewayEnabled;
          if (extra.dhcpdGateway !== undefined) unifiUpdates.dhcpd_gateway = extra.dhcpdGateway;
          if (extra.domainName !== undefined) unifiUpdates.domain_name = extra.domainName;
          if (extra.igmpSnooping !== undefined) unifiUpdates.igmp_snooping = extra.igmpSnooping;
          if (extra.internetAccessEnabled !== undefined) unifiUpdates.internet_access_enabled = extra.internetAccessEnabled;
          if (extra.networkIsolation !== undefined) unifiUpdates.network_isolation_enabled = !!extra.networkIsolation;

          if (Object.keys(unifiUpdates).length > 0) {
            await client.updateNetwork(existing.siteId || "default", existing.unifiNetworkId, unifiUpdates);
          }
        }
      }

      const { networkIsolation: _ni, ...safePartialData } = partial.data as any;
      const dbUpdates: any = { ...safePartialData };
      if (req.body.networkIsolation !== undefined) {
        dbUpdates.networkIsolation = req.body.networkIsolation;
      }
      if (Object.keys(dbUpdates).length === 0) {
        return res.json(existing);
      }
      const network = await storage.updateNetwork(req.params.id, dbUpdates);
      if (!network) return res.status(404).json({ message: "Network not found" });
      res.json(network);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to update network: ${err.message}` });
    }
  });

  app.get("/api/networks/:id/associations", requireAdmin, async (req, res) => {
    try {
      const network = await storage.getNetwork(req.params.id);
      if (!network) return res.status(404).json({ message: "Network not found" });

      const wifiNets = await storage.getWifiNetworksByControllerAndSite(network.controllerId, network.siteId || "default");
      const affectedWifi: Array<{ id: string; name: string; type: "ppsk_key" | "wlan" }> = [];

      for (const wn of wifiNets) {
        if (wn.networkConfId === network.unifiNetworkId) {
          affectedWifi.push({ id: wn.id, name: wn.name, type: "wlan" });
        } else if (wn.vlanId === network.vlanId) {
          affectedWifi.push({ id: wn.id, name: wn.name, type: "wlan" });
        }
      }

      if (network.unifiNetworkId) {
        const controller = await storage.getController(network.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          const allWlans = await client.getWlans(network.siteId || "default");
          for (const wlan of allWlans) {
            if (wlan.private_preshared_keys_enabled && wlan.private_preshared_keys?.length > 0) {
              const hasKey = wlan.private_preshared_keys.some(
                (k: any) => k.networkconf_id === network.unifiNetworkId || String(k.vlan) === String(network.vlanId)
              );
              if (hasKey && !affectedWifi.find(a => a.name === wlan.name)) {
                affectedWifi.push({ id: wlan._id, name: wlan.name, type: "ppsk_key" });
              }
            }
          }
        }
      }

      const allUnits = await storage.getAllUnits();
      const affectedUnits = allUnits.filter(u => u.networkId === network.id);

      res.json({
        network: { id: network.id, name: network.name, vlanId: network.vlanId },
        wifiNetworks: affectedWifi,
        units: affectedUnits.map(u => ({ id: u.id, unitNumber: u.unitNumber })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/networks/:id", requireAdmin, async (req, res) => {
    try {
      const network = await storage.getNetwork(req.params.id);
      if (!network) return res.status(404).json({ message: "Network not found" });
      if (!network.isManaged) return res.status(403).json({ message: "Cannot delete controller-managed networks. This network exists on the UniFi controller and was not created from this interface." });

      const controller = network.unifiNetworkId ? await storage.getController(network.controllerId) : null;
      const client = controller?.isVerified ? getUnifiClient(controller.id, controller.url, controller.username, controller.password) : null;
      const siteId = network.siteId || "default";

      if (client && network.unifiNetworkId) {
        try {
          const allWlans = await client.getWlans(siteId);
          for (const wlan of allWlans) {
            try {
              if (wlan.private_preshared_keys_enabled && wlan.private_preshared_keys?.length > 0) {
                const filteredKeys = wlan.private_preshared_keys.filter(
                  (k: any) => k.networkconf_id !== network.unifiNetworkId && String(k.vlan) !== String(network.vlanId)
                );
                if (filteredKeys.length < wlan.private_preshared_keys.length) {
                  await client.updateWlan(siteId, wlan._id, { private_preshared_keys: filteredKeys });
                }
              } else if (wlan.networkconf_id === network.unifiNetworkId) {
                await client.deleteWlan(siteId, wlan._id);
                const dbWifi = await storage.getWifiNetworksByControllerAndSite(network.controllerId, siteId);
                const match = dbWifi.find(w => w.unifiWlanId === wlan._id);
                if (match) await storage.deleteWifiNetwork(match.id);
              }
            } catch (e: any) {
              console.warn(`[networks] Could not clean up WLAN ${wlan._id} on controller: ${e.message}`);
            }
          }
        } catch (e: any) {
          console.warn(`[networks] Could not fetch WLANs for cleanup (may already be removed): ${e.message}`);
        }
      }

      const wifiNets = await storage.getWifiNetworksByControllerAndSite(network.controllerId, siteId);
      for (const wn of wifiNets) {
        if (wn.networkConfId === network.unifiNetworkId || wn.vlanId === network.vlanId) {
          if (wn.isManaged && wn.unifiWlanId && client) {
            try { await client.deleteWlan(siteId, wn.unifiWlanId); } catch {}
          }
          await storage.deleteWifiNetwork(wn.id);
        }
      }

      const allUnits = await storage.getAllUnits();
      for (const unit of allUnits) {
        if (unit.networkId === network.id) {
          await storage.updateUnit(unit.id, { networkId: null, vlanId: null, isProvisioned: false, unifiNetworkId: null });
        }
      }

      if (client && network.unifiNetworkId) {
        try {
          await client.deleteNetwork(siteId, network.unifiNetworkId);
        } catch (e: any) {
          console.warn(`[networks] Could not delete network from controller (may already be removed): ${e.message}`);
        }
      }

      await storage.deleteNetwork(req.params.id);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ message: `Failed to delete network: ${err.message}` });
    }
  });

  app.get("/api/wifi-networks/controller/:controllerId", requireAdmin, async (req, res) => {
    const siteId = (req.query.siteId as string) || "default";
    const dbWifiNets = await storage.getWifiNetworksByControllerAndSite(req.params.controllerId, siteId);
    const controller = await storage.getController(req.params.controllerId);
    if (!controller) return res.status(404).json({ message: "Controller not found" });

    if (controller.isVerified) {
      try {
        const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
        const liveWlans = await client.getWlans(siteId);

        for (const wlan of liveWlans) {
          const exists = dbWifiNets.some(w => w.unifiWlanId === wlan._id);
          if (!exists) {
            await storage.createWifiNetwork({
              controllerId: controller.id,
              name: wlan.name,
              securityMode: wlan.security || "wpapsk",
              wpaMode: wlan.wpa_mode || "wpa2",
              password: wlan.x_passphrase || null,
              networkConfId: wlan.networkconf_id || null,
              vlanId: wlan.vlan_id || null,
              isGuest: wlan.is_guest || false,
              enabled: wlan.enabled ?? true,
              unifiWlanId: wlan._id,
              siteId,
              isManaged: false,
            });
          }
        }

        const liveWlanIds = new Set(liveWlans.map((w: any) => w._id));

        const staleManagedWifi = dbWifiNets.filter(w => w.isManaged && w.unifiWlanId && !liveWlanIds.has(w.unifiWlanId));
        for (const stale of staleManagedWifi) {
          await storage.deleteWifiNetwork(stale.id);
        }

        const staleDiscoveredWifi = dbWifiNets.filter(w => !w.isManaged && w.unifiWlanId && !liveWlanIds.has(w.unifiWlanId));
        for (const stale of staleDiscoveredWifi) {
          await storage.deleteWifiNetwork(stale.id);
        }

        const updatedWifiNets = await storage.getWifiNetworksByControllerAndSite(req.params.controllerId, siteId);
        const wlanMap = new Map(liveWlans.map((w: any) => [w._id, w]));
        const enriched = updatedWifiNets.map(wn => {
          const live = wlanMap.get(wn.unifiWlanId);
          return { ...wn, ap_group_ids: live?.ap_group_ids || [] };
        });
        return res.json(enriched);
      } catch (err: any) {
        return res.json(dbWifiNets);
      }
    }
    res.json(dbWifiNets);
  });

  app.get("/api/ap-groups/controller/:controllerId", requireAdmin, async (req, res) => {
    try {
      const controller = await storage.getController(req.params.controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not found or not verified" });
      const siteId = (req.query.siteId as string) || "default";
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const groups = await client.getApGroups(siteId);
      res.json(groups.map((g: any) => ({
        _id: g._id,
        name: g.name,
        device_macs: g.device_macs || [],
        attr_no_delete: g.attr_no_delete || false,
      })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ap-groups", requireAdmin, async (req, res) => {
    try {
      const { controllerId, siteId, name, deviceMacs } = req.body;
      if (!controllerId || !name) return res.status(400).json({ message: "controllerId and name required" });
      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not found or not verified" });
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const result = await client.createApGroup(siteId || "default", name, deviceMacs || []);
      const group = result?.data?.[0] || result;
      if (!group?._id) return res.status(500).json({ message: "Failed to create AP group" });
      res.status(201).json({ _id: group._id, name: group.name, device_macs: group.device_macs || [] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/ap-groups/:id", requireAdmin, async (req, res) => {
    try {
      const { controllerId, siteId, name, deviceMacs } = req.body;
      if (!controllerId) return res.status(400).json({ message: "controllerId required" });
      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not found or not verified" });
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (deviceMacs !== undefined) updates.device_macs = deviceMacs;
      await client.updateApGroup(siteId || "default", req.params.id, updates);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/ap-groups/:id", requireAdmin, async (req, res) => {
    try {
      const controllerId = req.query.controllerId as string;
      const siteId = (req.query.siteId as string) || "default";
      if (!controllerId) return res.status(400).json({ message: "controllerId query param required" });
      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not found or not verified" });
      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);

      const wlans = await client.getWlans(siteId);
      const usingWlans = wlans.filter((w: any) => {
        if (w.ap_group_ids && Array.isArray(w.ap_group_ids) && w.ap_group_ids.includes(req.params.id)) return true;
        if (w.ap_group_mode === "custom" && w.ap_group_ids?.includes(req.params.id)) return true;
        return false;
      });
      if (usingWlans.length > 0) {
        const ssidNames = usingWlans.map((w: any) => w.name).join(", ");
        return res.status(409).json({
          message: `Cannot delete this AP group — it is currently assigned to ${usingWlans.length} SSID${usingWlans.length > 1 ? "s" : ""}: ${ssidNames}. Remove the AP group assignment from ${usingWlans.length > 1 ? "these SSIDs" : "this SSID"} first.`,
        });
      }

      await client.deleteApGroup(siteId, req.params.id);
      res.status(204).end();
    } catch (err: any) {
      if (err.message?.includes("invalid object") || err.message?.includes("Invalid")) {
        return res.status(409).json({ message: "Cannot delete this AP group — it may be in use by one or more SSIDs on the controller." });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wifi-networks", requireAdmin, async (req, res) => {
    try {
      const parsed = insertWifiNetworkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      const controller = await storage.getController(parsed.data.controllerId);
      if (!controller) return res.status(400).json({ message: "Controller not found" });

      const siteId = parsed.data.siteId || "default";
      let unifiWlanId: string | null = null;

      if (controller.isVerified) {
        const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
        const d = req.body as any;
        let result;
        if (d.isPpsk) {
          result = await client.createPpskWlan(
            siteId,
            d.name,
            d.networkConfId || "",
            [],
            {
              isGuest: d.isGuest,
              hideSsid: d.hideSsid,
              wlanBand: d.wlanBand,
              macFilterEnabled: d.macFilterEnabled,
              macFilterPolicy: d.macFilterPolicy,
              macFilterList: d.macFilterList,
              uapsdEnabled: d.uapsdEnabled,
              bcastEnhanceEnabled: d.bcastEnhanceEnabled,
              l2Isolation: d.l2Isolation,
              proxyArp: d.proxyArp,
              fastRoamingEnabled: d.fastRoamingEnabled,
              pmfMode: d.pmfMode,
              groupRekey: d.groupRekey,
              dtimMode: d.dtimMode,
              dtimNa: d.dtimNa,
              dtimNg: d.dtimNg,
              apGroupIds: d.apGroupIds,
              apGroupMode: d.apGroupMode,
              broadcastApMacs: d.broadcastApMacs,
            }
          );
        } else {
          result = await client.createWlan(siteId, {
            name: d.name,
            password: d.password || undefined,
            networkId: d.networkConfId || undefined,
            security: d.securityMode || "wpapsk",
            wpaMode: d.wpaMode || "wpa2",
            enabled: d.enabled ?? true,
            isGuest: d.isGuest,
            hideSsid: d.hideSsid,
            wlanBand: d.wlanBand,
            macFilterEnabled: d.macFilterEnabled,
            macFilterPolicy: d.macFilterPolicy,
            macFilterList: d.macFilterList,
            uapsdEnabled: d.uapsdEnabled,
            dtimMode: d.dtimMode,
            dtimNa: d.dtimNa,
            dtimNg: d.dtimNg,
            minrateNaEnabled: d.minrateNaEnabled,
            minrateNaDataRateKbps: d.minrateNaDataRateKbps,
            minrateNgEnabled: d.minrateNgEnabled,
            minrateNgDataRateKbps: d.minrateNgDataRateKbps,
            fastRoamingEnabled: d.fastRoamingEnabled,
            pmfMode: d.pmfMode,
            groupRekey: d.groupRekey,
            bcastEnhanceEnabled: d.bcastEnhanceEnabled,
            l2Isolation: d.l2Isolation,
            proxyArp: d.proxyArp,
            rateLimit: d.rateLimitEnabled,
            rateLimitUpload: d.rateLimitUpload,
            rateLimitDownload: d.rateLimitDownload,
            scheduleEnabled: d.scheduleEnabled,
            apGroupIds: d.apGroupIds,
            apGroupMode: d.apGroupMode,
            broadcastApMacs: d.broadcastApMacs,
          });
        }
        unifiWlanId = result?.data?.[0]?._id || null;
        if (!unifiWlanId) {
          return res.status(500).json({ message: "Failed to create WiFi network on UniFi controller." });
        }
      }

      const wifiNet = await storage.createWifiNetwork({
        ...parsed.data,
        unifiWlanId,
        isManaged: true,
      });
      res.status(201).json(wifiNet);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to create WiFi network: ${err.message}` });
    }
  });

  app.post("/api/wifi-networks/bulk", requireAdmin, async (req, res) => {
    try {
      const { mode, controllerId, siteId: reqSiteId, networkIds, existingWifiId, ssidConfig } = req.body;
      if (!mode || !controllerId || !Array.isArray(networkIds) || networkIds.length === 0) {
        return res.status(400).json({ message: "Missing required fields: mode, controllerId, networkIds" });
      }

      const controller = await storage.getController(controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not found or not verified" });

      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const siteId = reqSiteId || "default";

      const unassignedGroupId = await client.getOrCreateUnassignedApGroup(siteId);

      const allNetworks = await storage.getNetworksByController(controllerId);
      const selectedNetworks = allNetworks.filter(n => {
        if (!networkIds.includes(n.id) || n.siteId !== siteId) return false;
        const purpose = (n.purpose || "").toLowerCase();
        const name = (n.name || "").trim().toLowerCase();
        if (purpose === "wan" || purpose === "internet" || purpose === "remote-user-vpn" || name === "internet") return false;
        return true;
      });
      if (selectedNetworks.length === 0) return res.status(400).json({ message: "No valid networks selected for this site" });

      const results: Array<{ networkId: string; networkName: string; success: boolean; error?: string; generatedPassword?: string; ssidName?: string; skipped?: boolean }> = [];

      const existingWifiNetworks = await storage.getWifiNetworksByControllerAndSite(controllerId, siteId);
      const existingWifiNames = new Set(existingWifiNetworks.map(wn => wn.name.toLowerCase()));
      const existingWifiByVlan = new Map<number, string[]>();
      for (const wn of existingWifiNetworks) {
        if (wn.vlanId != null) {
          const names = existingWifiByVlan.get(wn.vlanId) || [];
          names.push(wn.name.toLowerCase());
          existingWifiByVlan.set(wn.vlanId, names);
        }
      }

      if (mode === "new") {
        const cfg = ssidConfig || {};
        const isPpsk = !!cfg.isPpsk;
        const autoPassword = !!cfg.autoPassword;
        const namingConvention = cfg.namingConvention || null;

        if (isPpsk) {
          if (existingWifiNames.has(cfg.name.toLowerCase())) {
            selectedNetworks.forEach(n => results.push({
              networkId: n.id, networkName: n.name, success: false, skipped: true,
              error: `SSID "${cfg.name}" already exists on this site`,
            }));
          } else {
          const validNetworks = selectedNetworks.filter(n => {
            if (!n.vlanId || n.vlanId === 0) {
              results.push({ networkId: n.id, networkName: n.name, success: false, error: "Network has no VLAN assigned (required for PPSK)" });
              return false;
            }
            return true;
          });
          if (validNetworks.length > 0) {
          const usedPasswords = new Set<string>();
          const ppskKeys = validNetworks.map(n => {
            let pw: string;
            do { pw = randomBytes(12).toString('base64url'); } while (usedPasswords.has(pw));
            usedPasswords.add(pw);
            return {
              password: pw,
              vlanId: n.vlanId,
              networkConfId: n.unifiNetworkId || "",
              description: n.name,
            };
          });
          const primaryNetwork = validNetworks[0];
          try {
            const result = await client.createPpskWlan(siteId, cfg.name, primaryNetwork.unifiNetworkId || "", ppskKeys, {
              isGuest: cfg.isGuest,
              hideSsid: cfg.hideSsid,
              wlanBand: cfg.wlanBand,
              apGroupIds: [unassignedGroupId],
            });
            const wlanId = result?.data?.[0]?._id;
            if (wlanId) {
              await storage.createWifiNetwork({
                controllerId,
                name: cfg.name,
                securityMode: "wpapsk",
                wpaMode: "wpa2",
                password: null,
                networkConfId: primaryNetwork.unifiNetworkId,
                vlanId: primaryNetwork.vlanId,
                isGuest: cfg.isGuest || false,
                enabled: true,
                unifiWlanId: wlanId,
                siteId,
                isManaged: true,
              });
              validNetworks.forEach((n, i) => results.push({
                networkId: n.id, networkName: n.name, success: true,
                generatedPassword: ppskKeys[i].password, ssidName: cfg.name,
              }));
            } else {
              validNetworks.forEach(n => results.push({ networkId: n.id, networkName: n.name, success: false, error: "No WLAN ID returned" }));
            }
          } catch (err: any) {
            validNetworks.forEach(n => results.push({ networkId: n.id, networkName: n.name, success: false, error: err.message }));
          }
          }
          }
        } else if (autoPassword && namingConvention) {
          for (const net of selectedNetworks) {
            try {
              let ssidName = net.name;
              if (namingConvention === "prefix") {
                ssidName = `${cfg.prefix || "WiFi"}-${net.vlanId}`;
              } else if (namingConvention === "custom") {
                ssidName = `${cfg.prefix || "WiFi"}-${net.name}`;
              }
              const vlanNames = existingWifiByVlan.get(net.vlanId!) || [];
              if (vlanNames.includes(ssidName.toLowerCase())) {
                results.push({ networkId: net.id, networkName: net.name, success: false, skipped: true, ssidName, error: `SSID "${ssidName}" already exists on VLAN ${net.vlanId}` });
                continue;
              }
              const password = randomBytes(8).toString('base64url');
              const result = await client.createWlan(siteId, {
                name: ssidName,
                password,
                networkId: net.unifiNetworkId || undefined,
                security: "wpapsk",
                wpaMode: "wpa2",
                enabled: true,
                apGroupIds: [unassignedGroupId],
              });
              const wlanId = result?.data?.[0]?._id;
              if (wlanId) {
                await storage.createWifiNetwork({
                  controllerId,
                  name: ssidName,
                  securityMode: "wpapsk",
                  wpaMode: "wpa2",
                  password,
                  networkConfId: net.unifiNetworkId,
                  vlanId: net.vlanId,
                  isGuest: false,
                  enabled: true,
                  unifiWlanId: wlanId,
                  siteId,
                  isManaged: true,
                });
                results.push({ networkId: net.id, networkName: net.name, success: true, generatedPassword: password, ssidName });
              } else {
                results.push({ networkId: net.id, networkName: net.name, success: false, error: "No WLAN ID returned" });
              }
            } catch (err: any) {
              results.push({ networkId: net.id, networkName: net.name, success: false, error: err.message });
            }
          }
        } else {
          for (const net of selectedNetworks) {
            try {
              const vlanNames = existingWifiByVlan.get(net.vlanId!) || [];
              if (vlanNames.includes((cfg.name || "").toLowerCase())) {
                results.push({ networkId: net.id, networkName: net.name, success: false, skipped: true, error: `SSID "${cfg.name}" already exists on VLAN ${net.vlanId}` });
                continue;
              }
              const result = await client.createWlan(siteId, {
                name: cfg.name,
                password: cfg.password || undefined,
                networkId: net.unifiNetworkId || undefined,
                security: cfg.securityMode || "wpapsk",
                wpaMode: cfg.wpaMode || "wpa2",
                enabled: cfg.enabled ?? true,
                isGuest: cfg.isGuest,
                hideSsid: cfg.hideSsid,
                wlanBand: cfg.wlanBand,
                apGroupIds: [unassignedGroupId],
              });
              const wlanId = result?.data?.[0]?._id;
              if (wlanId) {
                await storage.createWifiNetwork({
                  controllerId,
                  name: cfg.name,
                  securityMode: cfg.securityMode || "wpapsk",
                  wpaMode: cfg.wpaMode || "wpa2",
                  password: cfg.password || null,
                  networkConfId: net.unifiNetworkId,
                  vlanId: net.vlanId,
                  isGuest: cfg.isGuest || false,
                  enabled: cfg.enabled ?? true,
                  unifiWlanId: wlanId,
                  siteId,
                  isManaged: true,
                });
                results.push({ networkId: net.id, networkName: net.name, success: true });
              } else {
                results.push({ networkId: net.id, networkName: net.name, success: false, error: "No WLAN ID returned" });
              }
            } catch (err: any) {
              results.push({ networkId: net.id, networkName: net.name, success: false, error: err.message });
            }
          }
        }
      } else if (mode === "existing") {
        if (!existingWifiId) return res.status(400).json({ message: "existingWifiId required for existing mode" });
        const existingWifi = await storage.getWifiNetwork(existingWifiId);
        if (!existingWifi) return res.status(404).json({ message: "Existing WiFi network not found" });
        if (existingWifi.controllerId !== controllerId || existingWifi.siteId !== siteId) {
          return res.status(400).json({ message: "Existing WiFi does not belong to this controller/site" });
        }
        if (!existingWifi.unifiWlanId) return res.status(400).json({ message: "Existing WiFi has no UniFi WLAN ID" });

        const isPpsk = existingWifi.securityMode === "wpapsk" && !existingWifi.password;

        if (isPpsk) {
          try {
            const wlanDetail = await client.getWlanDetail(siteId, existingWifi.unifiWlanId);
            const existingKeys: any[] = wlanDetail?.private_preshared_keys || [];
            const existingVlans = new Set(existingKeys.map((k: any) => String(k.vlan || k.vlanId)));
            const newKeys: Array<{ password: string; vlan: string; description: string }> = [];
            const skippedNetworks: string[] = [];
            for (const n of selectedNetworks) {
              if (!n.vlanId || n.vlanId === 0) {
                results.push({ networkId: n.id, networkName: n.name, success: false, error: "Network has no VLAN assigned (required for PPSK)" });
                skippedNetworks.push(n.id);
              } else if (existingVlans.has(String(n.vlanId))) {
                skippedNetworks.push(n.id);
                results.push({ networkId: n.id, networkName: n.name, success: false, error: "VLAN already has a PPSK key on this SSID" });
              } else {
                newKeys.push({ password: randomBytes(8).toString('base64url'), vlan: String(n.vlanId), description: n.name });
              }
            }
            if (newKeys.length > 0) {
              const mergedKeys = [...existingKeys, ...newKeys];
              await client.updateWlan(siteId, existingWifi.unifiWlanId, { private_preshared_keys: mergedKeys });
              let keyIdx = 0;
              for (const n of selectedNetworks) {
                if (!skippedNetworks.includes(n.id)) {
                  results.push({
                    networkId: n.id, networkName: n.name, success: true,
                    generatedPassword: newKeys[keyIdx].password, ssidName: existingWifi.name,
                  });
                  keyIdx++;
                }
              }
            }
          } catch (err: any) {
            selectedNetworks.forEach(n => results.push({ networkId: n.id, networkName: n.name, success: false, error: err.message }));
          }
        } else {
          for (const net of selectedNetworks) {
            try {
              const result = await client.createWlan(siteId, {
                name: existingWifi.name,
                password: existingWifi.password || undefined,
                networkId: net.unifiNetworkId || undefined,
                security: existingWifi.securityMode || "wpapsk",
                wpaMode: existingWifi.wpaMode || "wpa2",
                enabled: existingWifi.enabled ?? true,
                isGuest: existingWifi.isGuest || false,
                apGroupIds: [unassignedGroupId],
              });
              const wlanId = result?.data?.[0]?._id;
              if (wlanId) {
                await storage.createWifiNetwork({
                  controllerId,
                  name: existingWifi.name,
                  securityMode: existingWifi.securityMode || "wpapsk",
                  wpaMode: existingWifi.wpaMode || "wpa2",
                  password: existingWifi.password,
                  networkConfId: net.unifiNetworkId,
                  vlanId: net.vlanId,
                  isGuest: existingWifi.isGuest || false,
                  enabled: existingWifi.enabled ?? true,
                  unifiWlanId: wlanId,
                  siteId,
                  isManaged: true,
                });
                results.push({ networkId: net.id, networkName: net.name, success: true });
              } else {
                results.push({ networkId: net.id, networkName: net.name, success: false, error: "No WLAN ID returned" });
              }
            } catch (err: any) {
              results.push({ networkId: net.id, networkName: net.name, success: false, error: err.message });
            }
          }
        }
      } else {
        return res.status(400).json({ message: "Invalid mode. Use 'new' or 'existing'." });
      }

      const succeeded = results.filter(r => r.success).length;
      const skipped = results.filter(r => r.skipped).length;
      const failed = results.filter(r => !r.success && !r.skipped).length;
      res.json({ total: results.length, succeeded, skipped, failed, results });
    } catch (err: any) {
      res.status(500).json({ message: `Bulk WiFi operation failed: ${err.message}` });
    }
  });

  app.patch("/api/wifi-networks/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getWifiNetwork(req.params.id);
      if (!existing) return res.status(404).json({ message: "WiFi network not found" });
      if (!existing.isManaged) return res.status(403).json({ message: "Cannot edit controller-managed WiFi networks." });

      const { name, password, isGuest, enabled, security, wpaMode, wlanBand,
        hideSsid, pmfMode, apGroupMode, apGroupIds, broadcastApMacs,
        fastRoamingEnabled, bssTransition, uapsdEnabled,
        l2Isolation, proxyArp, groupRekey,
        dtimMode, dtimNa, dtimNg,
        minrateNaEnabled, minrateNgEnabled,
        minrateNaDataRateKbps, minrateNgDataRateKbps } = req.body;
      const dbUpdates: Partial<InsertWifiNetwork> = {};
      const unifiUpdates: Record<string, any> = {};

      if (name !== undefined) { dbUpdates.name = name; unifiUpdates.name = name; }
      if (password !== undefined && password !== "") { dbUpdates.password = password; unifiUpdates.x_passphrase = password; }
      if (isGuest !== undefined) { dbUpdates.isGuest = isGuest; unifiUpdates.is_guest = isGuest; }
      if (enabled !== undefined) { dbUpdates.enabled = enabled; unifiUpdates.enabled = enabled; }

      if (security !== undefined) {
        dbUpdates.securityMode = security;
        unifiUpdates.security = security;
      }
      if (wpaMode !== undefined) {
        dbUpdates.wpaMode = wpaMode;
        unifiUpdates.wpa_mode = wpaMode;
      }
      if (wlanBand !== undefined) { unifiUpdates.wlan_band = wlanBand; }
      if (hideSsid !== undefined) { unifiUpdates.hide_ssid = hideSsid; }
      if (pmfMode !== undefined) { unifiUpdates.pmf_mode = pmfMode; }

      if (broadcastApMacs && Array.isArray(broadcastApMacs) && broadcastApMacs.length > 0 && existing.unifiWlanId) {
        const controller = await storage.getController(existing.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          const wlanName = name || existing.name || "WLAN";
          const groupName = `SSID-${wlanName}-APs`;
          const group = await client.createApGroup(existing.siteId || "default", groupName, broadcastApMacs);
          const groupId = group?.data?.[0]?._id || group?._id;
          if (groupId) {
            unifiUpdates.ap_group_ids = [groupId];
          }
        }
      } else if (apGroupMode !== undefined) {
        if (apGroupMode === "all") {
          const client2 = getUnifiClient(controller!.id, controller!.url, controller!.username, controller!.password);
          const apGroups = await client2.getApGroups(existing.siteId || "default");
          const defaultGroup = apGroups.find((g: any) => g.attr_no_delete) || apGroups[0];
          if (defaultGroup?._id) {
            unifiUpdates.ap_group_ids = [defaultGroup._id];
          }
        } else if (apGroupIds !== undefined) {
          unifiUpdates.ap_group_ids = apGroupIds;
        }
      }

      if (fastRoamingEnabled !== undefined) { unifiUpdates.fast_roaming_enabled = fastRoamingEnabled; }
      if (bssTransition !== undefined) { unifiUpdates.bss_transition = bssTransition; }
      if (uapsdEnabled !== undefined) { unifiUpdates.uapsd_enabled = uapsdEnabled; }
      if (l2Isolation !== undefined) { unifiUpdates.l2_isolation = l2Isolation; }
      if (proxyArp !== undefined) { unifiUpdates.proxy_arp = proxyArp; }
      if (groupRekey !== undefined) { unifiUpdates.group_rekey = groupRekey; }

      if (dtimMode !== undefined) { unifiUpdates.dtim_mode = dtimMode; }
      if (dtimNa !== undefined) { unifiUpdates.dtim_na = dtimNa; }
      if (dtimNg !== undefined) { unifiUpdates.dtim_ng = dtimNg; }

      if (minrateNaEnabled !== undefined) { unifiUpdates.minrate_na_enabled = minrateNaEnabled; }
      if (minrateNgEnabled !== undefined) { unifiUpdates.minrate_ng_enabled = minrateNgEnabled; }
      if (minrateNaDataRateKbps !== undefined) { unifiUpdates.minrate_na_data_rate_kbps = minrateNaDataRateKbps; }
      if (minrateNgDataRateKbps !== undefined) { unifiUpdates.minrate_ng_data_rate_kbps = minrateNgDataRateKbps; }

      if (existing.unifiWlanId && Object.keys(unifiUpdates).length > 0) {
        const controller = await storage.getController(existing.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          await client.updateWlan(existing.siteId || "default", existing.unifiWlanId, unifiUpdates);
        }
      }

      const updated = await storage.updateWifiNetwork(req.params.id, dbUpdates);
      if (!updated) return res.status(404).json({ message: "WiFi network not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to update WiFi network: ${err.message}` });
    }
  });

  app.post("/api/wifi-networks/:id/ppsk-keys", requireAdmin, async (req, res) => {
    try {
      const wifi = await storage.getWifiNetwork(req.params.id);
      if (!wifi) return res.status(404).json({ message: "WiFi network not found" });
      if (!wifi.unifiWlanId) return res.status(400).json({ message: "No UniFi WLAN linked" });

      const controller = await storage.getController(wifi.controllerId);
      if (!controller?.isVerified) return res.status(400).json({ message: "Controller not verified" });

      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const siteId = wifi.siteId || "default";
      const raw = await client.getWlanDetail(siteId, wifi.unifiWlanId);
      if (!raw) return res.status(404).json({ message: "WLAN not found on controller" });

      const existingKeys: any[] = raw.private_preshared_keys || [];
      const { action, keys, networkconfIds } = req.body;

      if (action === "add" && Array.isArray(keys)) {
        const newKeys = keys.map((k: any) => ({
          password: k.password,
          vlan: String(k.vlan || "0"),
          networkconf_id: k.networkconf_id,
          description: k.description || "",
        }));
        const existingConfIds = new Set(existingKeys.map((ek: any) => ek.networkconf_id));
        const deduped = newKeys.filter((nk: any) => !existingConfIds.has(nk.networkconf_id));
        const merged = [...existingKeys, ...deduped];
        await client.updateWlan(siteId, wifi.unifiWlanId, { private_preshared_keys: merged });
        res.json({ message: `Added ${deduped.length} key(s)`, total: merged.length });
      } else if (action === "remove" && Array.isArray(networkconfIds)) {
        const removeSet = new Set(networkconfIds);
        const filtered = existingKeys.filter((k: any) => !removeSet.has(k.networkconf_id));
        await client.updateWlan(siteId, wifi.unifiWlanId, { private_preshared_keys: filtered });
        res.json({ message: `Removed ${existingKeys.length - filtered.length} key(s)`, total: filtered.length });
      } else {
        res.status(400).json({ message: "Invalid action. Use 'add' or 'remove'." });
      }
    } catch (err: any) {
      res.status(500).json({ message: `Failed to manage PPSK keys: ${err.message}` });
    }
  });

  app.delete("/api/wifi-networks/:id", requireAdmin, async (req, res) => {
    try {
      const wifiNet = await storage.getWifiNetwork(req.params.id);
      if (!wifiNet) return res.status(404).json({ message: "WiFi network not found" });
      if (!wifiNet.isManaged) return res.status(403).json({ message: "Cannot delete controller-managed WiFi networks. This SSID exists on the UniFi controller and was not created from this interface." });

      if (wifiNet.unifiWlanId) {
        const controller = await storage.getController(wifiNet.controllerId);
        if (controller?.isVerified) {
          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          await client.deleteWlan(wifiNet.siteId || "default", wifiNet.unifiWlanId);
        }
      }

      await storage.deleteWifiNetwork(req.params.id);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ message: `Failed to delete WiFi network: ${err.message}` });
    }
  });

  app.get("/api/controllers/:id/backup-settings", requireAdmin, async (req, res) => {
    const settings = await storage.getBackupSettings(req.params.id);
    res.json(settings || { controllerId: req.params.id, enabled: false, schedule: "daily" });
  });

  app.put("/api/controllers/:id/backup-settings", requireAdmin, async (req, res) => {
    try {
      const { enabled, schedule, consentAccepted } = req.body;
      const validSchedules = ["daily", "weekly", "monthly"];
      const validatedSchedule = validSchedules.includes(schedule) ? schedule : "daily";
      const validatedEnabled = typeof enabled === "boolean" ? enabled : false;

      const controllerId = req.params.id;
      const controller = await storage.getController(controllerId);
      if (!controller) return res.status(404).json({ message: "Controller not found" });

      if (validatedEnabled && !consentAccepted) {
        const existing = await storage.getBackupSettings(controllerId);
        if (!existing?.consentAcceptedAt) {
          return res.status(400).json({ message: "You must accept the cloud storage consent to enable backups." });
        }
      }

      const intervalMs: Record<string, number> = { daily: 86400000, weekly: 604800000, monthly: 2592000000 };

      const now = new Date();
      const nextBackupAt = validatedEnabled ? new Date(now.getTime() + intervalMs[validatedSchedule]) : null;

      const settings = await storage.upsertBackupSettings({
        controllerId,
        enabled: validatedEnabled,
        schedule: validatedSchedule,
        consentAcceptedAt: consentAccepted ? now : undefined,
        consentAcceptedBy: consentAccepted ? (req.user as any)?.id : undefined,
        nextBackupAt,
      });
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/controllers/:id/backups", requireAdmin, async (req, res) => {
    const backups = await storage.getBackupsByController(req.params.id);
    res.json(backups.map(b => ({ ...b, fileData: undefined })));
  });

  app.post("/api/controllers/:id/backups/trigger", requireAdmin, async (req, res) => {
    try {
      const controller = await storage.getController(req.params.id);
      if (!controller) return res.status(404).json({ message: "Controller not found" });
      if (!controller.isVerified) return res.status(400).json({ message: "Controller not verified" });

      const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
      const { url } = await client.triggerBackup();
      const fileBuffer = await client.downloadBackup(url);
      const base64Data = fileBuffer.toString("base64");

      const settings = await storage.getBackupSettings(controller.id);
      const schedule = settings?.schedule || "daily";

      const now = new Date();
      const filename = `backup_${controller.name.replace(/[^a-zA-Z0-9]/g, "_")}_${now.toISOString().replace(/[:.]/g, "-")}.unf`;

      const backup = await storage.createBackup({
        controllerId: controller.id,
        filename,
        fileData: base64Data,
        fileSize: fileBuffer.length,
        createdAt: now,
        schedule,
      });

      await storage.trimBackupsForController(controller.id, 14);

      if (settings) {
        const intervalMs: Record<string, number> = { daily: 86400000, weekly: 604800000, monthly: 2592000000 };
        await storage.updateBackupSettings(controller.id, {
          lastBackupAt: now,
          nextBackupAt: new Date(now.getTime() + (intervalMs[schedule] || intervalMs.daily)),
        });
      }

      res.json({ ...backup, fileData: undefined });
    } catch (err: any) {
      res.status(500).json({ message: `Backup failed: ${err.message}` });
    }
  });

  app.get("/api/backups/:id/download", requireAdmin, async (req, res) => {
    try {
      const backup = await storage.getBackup(req.params.id);
      if (!backup) return res.status(404).json({ message: "Backup not found" });

      const buffer = Buffer.from(backup.fileData, "base64");
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${backup.filename}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/backups/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteBackup(req.params.id);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
          await client.setPortProfile(siteId, device.unifiDeviceId, device.macAddress, assignment.portNumber, vlanId);
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

  setInterval(async () => {
    try {
      const allSettings = await storage.getAllBackupSettings();
      const now = new Date();
      for (const settings of allSettings) {
        if (!settings.enabled || !settings.nextBackupAt) continue;
        if (new Date(settings.nextBackupAt) > now) continue;

        try {
          const controller = await storage.getController(settings.controllerId);
          if (!controller?.isVerified) continue;

          const client = getUnifiClient(controller.id, controller.url, controller.username, controller.password);
          const { url } = await client.triggerBackup();
          const fileBuffer = await client.downloadBackup(url);
          const base64Data = fileBuffer.toString("base64");

          const intervalMs: Record<string, number> = { daily: 86400000, weekly: 604800000, monthly: 2592000000 };
          const filename = `backup_${controller.name.replace(/[^a-zA-Z0-9]/g, "_")}_${now.toISOString().replace(/[:.]/g, "-")}.unf`;

          await storage.createBackup({
            controllerId: controller.id,
            filename,
            fileData: base64Data,
            fileSize: fileBuffer.length,
            createdAt: now,
            schedule: settings.schedule,
          });

          await storage.trimBackupsForController(controller.id, 14);

          await storage.updateBackupSettings(controller.id, {
            lastBackupAt: now,
            nextBackupAt: new Date(now.getTime() + (intervalMs[settings.schedule] || intervalMs.daily)),
          });

          console.log(`[backup] Scheduled backup completed for controller ${controller.name}`);
        } catch (err: any) {
          console.error(`[backup] Failed for controller ${settings.controllerId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[backup] Scheduler error: ${err.message}`);
    }
  }, 60000);

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
