import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  users, communities, buildings, units, devices, unitDevicePorts, inviteTokens, controllers, sites, networks,
  type User, type InsertUser,
  type Community, type InsertCommunity,
  type Building, type InsertBuilding,
  type Unit, type InsertUnit,
  type Device, type InsertDevice,
  type UnitDevicePort, type InsertUnitDevicePort,
  type InviteToken, type InsertInviteToken,
  type Controller, type InsertController,
  type Network, type InsertNetwork,
  type Site, type InsertSite,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUsersByRole(role: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  getCommunities(): Promise<Community[]>;
  getCommunity(id: string): Promise<Community | undefined>;
  createCommunity(data: InsertCommunity): Promise<Community>;
  updateCommunity(id: string, data: Partial<InsertCommunity>): Promise<Community | undefined>;
  deleteCommunity(id: string): Promise<void>;

  getBuildings(communityId: string): Promise<Building[]>;
  getBuilding(id: string): Promise<Building | undefined>;
  createBuilding(data: InsertBuilding): Promise<Building>;
  updateBuilding(id: string, data: Partial<InsertBuilding>): Promise<Building | undefined>;
  deleteBuilding(id: string): Promise<void>;

  getUnits(buildingId: string): Promise<Unit[]>;
  getUnit(id: string): Promise<Unit | undefined>;
  createUnit(data: InsertUnit): Promise<Unit>;
  updateUnit(id: string, data: Partial<InsertUnit>): Promise<Unit | undefined>;
  deleteUnit(id: string): Promise<void>;
  getUnitsByBuilding(buildingId: string): Promise<Unit[]>;

  getDevices(communityId?: string): Promise<Device[]>;
  getDevice(id: string): Promise<Device | undefined>;
  createDevice(data: InsertDevice): Promise<Device>;
  updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined>;
  deleteDevice(id: string): Promise<void>;
  getDevicesByBuilding(buildingId: string): Promise<Device[]>;

  getPortAssignments(unitId: string): Promise<UnitDevicePort[]>;
  createPortAssignment(data: InsertUnitDevicePort): Promise<UnitDevicePort>;
  deletePortAssignment(id: string): Promise<void>;
  getPortAssignmentsByDevice(deviceId: string): Promise<UnitDevicePort[]>;

  createInviteToken(data: InsertInviteToken): Promise<InviteToken>;
  getInviteTokenByToken(token: string): Promise<InviteToken | undefined>;
  markInviteTokenUsed(id: string): Promise<void>;
  getInviteTokensByUnit(unitId: string): Promise<InviteToken[]>;
  getPendingInvites(): Promise<InviteToken[]>;

  getControllers(): Promise<Controller[]>;
  getController(id: string): Promise<Controller | undefined>;
  createController(data: InsertController): Promise<Controller>;
  updateController(id: string, data: Partial<InsertController>): Promise<Controller | undefined>;
  deleteController(id: string): Promise<void>;

  getNetworksByController(controllerId: string): Promise<Network[]>;
  getNetwork(id: string): Promise<Network | undefined>;
  createNetwork(data: InsertNetwork): Promise<Network>;
  updateNetwork(id: string, data: Partial<InsertNetwork>): Promise<Network | undefined>;
  deleteNetwork(id: string): Promise<void>;
  deleteNetworksByController(controllerId: string): Promise<void>;

  getSitesByController(controllerId: string): Promise<Site[]>;
  getSite(id: string): Promise<Site | undefined>;
  createSite(data: InsertSite): Promise<Site>;
  deleteSitesByController(controllerId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, role as any));
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getCommunities(): Promise<Community[]> {
    return db.select().from(communities);
  }

  async getCommunity(id: string): Promise<Community | undefined> {
    const [community] = await db.select().from(communities).where(eq(communities.id, id));
    return community;
  }

  async createCommunity(data: InsertCommunity): Promise<Community> {
    const [community] = await db.insert(communities).values(data).returning();
    return community;
  }

  async updateCommunity(id: string, data: Partial<InsertCommunity>): Promise<Community | undefined> {
    const [community] = await db.update(communities).set(data).where(eq(communities.id, id)).returning();
    return community;
  }

  async deleteCommunity(id: string): Promise<void> {
    await db.delete(communities).where(eq(communities.id, id));
  }

  async getBuildings(communityId: string): Promise<Building[]> {
    return db.select().from(buildings).where(eq(buildings.communityId, communityId));
  }

  async getBuilding(id: string): Promise<Building | undefined> {
    const [building] = await db.select().from(buildings).where(eq(buildings.id, id));
    return building;
  }

  async createBuilding(data: InsertBuilding): Promise<Building> {
    const [building] = await db.insert(buildings).values(data).returning();
    return building;
  }

  async updateBuilding(id: string, data: Partial<InsertBuilding>): Promise<Building | undefined> {
    const [building] = await db.update(buildings).set(data).where(eq(buildings.id, id)).returning();
    return building;
  }

  async deleteBuilding(id: string): Promise<void> {
    await db.delete(buildings).where(eq(buildings.id, id));
  }

  async getUnits(buildingId: string): Promise<Unit[]> {
    return db.select().from(units).where(eq(units.buildingId, buildingId));
  }

  async getUnit(id: string): Promise<Unit | undefined> {
    const [unit] = await db.select().from(units).where(eq(units.id, id));
    return unit;
  }

  async createUnit(data: InsertUnit): Promise<Unit> {
    const [unit] = await db.insert(units).values(data).returning();
    return unit;
  }

  async updateUnit(id: string, data: Partial<InsertUnit>): Promise<Unit | undefined> {
    const [unit] = await db.update(units).set(data).where(eq(units.id, id)).returning();
    return unit;
  }

  async deleteUnit(id: string): Promise<void> {
    await db.delete(units).where(eq(units.id, id));
  }

  async getUnitsByBuilding(buildingId: string): Promise<Unit[]> {
    return db.select().from(units).where(eq(units.buildingId, buildingId));
  }

  async getDevices(communityId?: string): Promise<Device[]> {
    if (communityId) {
      return db.select().from(devices).where(eq(devices.communityId, communityId));
    }
    return db.select().from(devices);
  }

  async getDevice(id: string): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device;
  }

  async createDevice(data: InsertDevice): Promise<Device> {
    const [device] = await db.insert(devices).values(data).returning();
    return device;
  }

  async updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined> {
    const [device] = await db.update(devices).set(data).where(eq(devices.id, id)).returning();
    return device;
  }

  async deleteDevice(id: string): Promise<void> {
    await db.delete(devices).where(eq(devices.id, id));
  }

  async getDevicesByBuilding(buildingId: string): Promise<Device[]> {
    return db.select().from(devices).where(eq(devices.buildingId, buildingId));
  }

  async getPortAssignments(unitId: string): Promise<UnitDevicePort[]> {
    return db.select().from(unitDevicePorts).where(eq(unitDevicePorts.unitId, unitId));
  }

  async createPortAssignment(data: InsertUnitDevicePort): Promise<UnitDevicePort> {
    const [assignment] = await db.insert(unitDevicePorts).values(data).returning();
    return assignment;
  }

  async deletePortAssignment(id: string): Promise<void> {
    await db.delete(unitDevicePorts).where(eq(unitDevicePorts.id, id));
  }

  async getPortAssignmentsByDevice(deviceId: string): Promise<UnitDevicePort[]> {
    return db.select().from(unitDevicePorts).where(eq(unitDevicePorts.deviceId, deviceId));
  }

  async createInviteToken(data: InsertInviteToken): Promise<InviteToken> {
    const [token] = await db.insert(inviteTokens).values(data).returning();
    return token;
  }

  async getInviteTokenByToken(token: string): Promise<InviteToken | undefined> {
    const [result] = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token));
    return result;
  }

  async markInviteTokenUsed(id: string): Promise<void> {
    await db.update(inviteTokens).set({ usedAt: new Date() }).where(eq(inviteTokens.id, id));
  }

  async getInviteTokensByUnit(unitId: string): Promise<InviteToken[]> {
    return db.select().from(inviteTokens).where(eq(inviteTokens.unitId, unitId));
  }

  async getPendingInvites(): Promise<InviteToken[]> {
    const { isNull } = await import("drizzle-orm");
    return db.select().from(inviteTokens).where(isNull(inviteTokens.usedAt));
  }

  async getControllers(): Promise<Controller[]> {
    return db.select().from(controllers);
  }

  async getController(id: string): Promise<Controller | undefined> {
    const [controller] = await db.select().from(controllers).where(eq(controllers.id, id));
    return controller;
  }

  async createController(data: InsertController): Promise<Controller> {
    const [controller] = await db.insert(controllers).values(data).returning();
    return controller;
  }

  async updateController(id: string, data: Partial<InsertController>): Promise<Controller | undefined> {
    const [controller] = await db.update(controllers).set(data).where(eq(controllers.id, id)).returning();
    return controller;
  }

  async deleteController(id: string): Promise<void> {
    await db.delete(networks).where(eq(networks.controllerId, id));
    await db.delete(sites).where(eq(sites.controllerId, id));
    await db.delete(controllers).where(eq(controllers.id, id));
  }

  async getNetworksByController(controllerId: string): Promise<Network[]> {
    return db.select().from(networks).where(eq(networks.controllerId, controllerId));
  }

  async getNetwork(id: string): Promise<Network | undefined> {
    const [network] = await db.select().from(networks).where(eq(networks.id, id));
    return network;
  }

  async createNetwork(data: InsertNetwork): Promise<Network> {
    const [network] = await db.insert(networks).values(data).returning();
    return network;
  }

  async updateNetwork(id: string, data: Partial<InsertNetwork>): Promise<Network | undefined> {
    const [network] = await db.update(networks).set(data).where(eq(networks.id, id)).returning();
    return network;
  }

  async deleteNetwork(id: string): Promise<void> {
    await db.delete(networks).where(eq(networks.id, id));
  }

  async deleteNetworksByController(controllerId: string): Promise<void> {
    await db.delete(networks).where(eq(networks.controllerId, controllerId));
  }

  async getSitesByController(controllerId: string): Promise<Site[]> {
    return db.select().from(sites).where(eq(sites.controllerId, controllerId));
  }

  async getSite(id: string): Promise<Site | undefined> {
    const [site] = await db.select().from(sites).where(eq(sites.id, id));
    return site;
  }

  async createSite(data: InsertSite): Promise<Site> {
    const [site] = await db.insert(sites).values(data).returning();
    return site;
  }

  async deleteSitesByController(controllerId: string): Promise<void> {
    await db.delete(sites).where(eq(sites.controllerId, controllerId));
  }
}

export const storage = new DatabaseStorage();
