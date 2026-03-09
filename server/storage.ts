import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  users, communities, buildings, units, devices, unitDevicePorts,
  type User, type InsertUser,
  type Community, type InsertCommunity,
  type Building, type InsertBuilding,
  type Unit, type InsertUnit,
  type Device, type InsertDevice,
  type UnitDevicePort, type InsertUnitDevicePort,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
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
}

export const storage = new DatabaseStorage();
