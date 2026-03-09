import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["admin", "tenant"]);
export const wifiModeEnum = pgEnum("wifi_mode", ["ppsk", "individual"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").notNull().default("admin"),
  unitId: varchar("unit_id"),
  displayName: text("display_name"),
});

export const communities = pgTable("communities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  unifiSiteId: text("unifi_site_id").default("default"),
});

export const buildings = pgTable("buildings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  communityId: varchar("community_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
});

export const units = pgTable("units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buildingId: varchar("building_id").notNull(),
  unitNumber: text("unit_number").notNull(),
  vlanId: integer("vlan_id"),
  wifiMode: wifiModeEnum("wifi_mode").default("ppsk"),
  wifiSsid: text("wifi_ssid"),
  wifiPassword: text("wifi_password"),
  tenantName: text("tenant_name"),
  tenantEmail: text("tenant_email"),
  isProvisioned: boolean("is_provisioned").default(false),
  unifiNetworkId: text("unifi_network_id"),
  unifiWlanId: text("unifi_wlan_id"),
});

export const devices = pgTable("devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  macAddress: text("mac_address").notNull(),
  model: text("model"),
  unifiDeviceId: text("unifi_device_id"),
  buildingId: varchar("building_id"),
  communityId: varchar("community_id"),
});

export const unitDevicePorts = pgTable("unit_device_ports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull(),
  deviceId: varchar("device_id").notNull(),
  portNumber: integer("port_number").notNull(),
});

export const communitiesRelations = relations(communities, ({ many }) => ({
  buildings: many(buildings),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  community: one(communities, { fields: [buildings.communityId], references: [communities.id] }),
  units: many(units),
  devices: many(devices),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  building: one(buildings, { fields: [units.buildingId], references: [buildings.id] }),
  portAssignments: many(unitDevicePorts),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  building: one(buildings, { fields: [devices.buildingId], references: [buildings.id] }),
  portAssignments: many(unitDevicePorts),
}));

export const unitDevicePortsRelations = relations(unitDevicePorts, ({ one }) => ({
  unit: one(units, { fields: [unitDevicePorts.unitId], references: [units.id] }),
  device: one(devices, { fields: [unitDevicePorts.deviceId], references: [devices.id] }),
}));

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertCommunitySchema = createInsertSchema(communities).omit({ id: true });
export const insertBuildingSchema = createInsertSchema(buildings).omit({ id: true });
export const insertUnitSchema = createInsertSchema(units).omit({ id: true });
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true });
export const insertUnitDevicePortSchema = createInsertSchema(unitDevicePorts).omit({ id: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCommunity = z.infer<typeof insertCommunitySchema>;
export type Community = typeof communities.$inferSelect;
export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type Building = typeof buildings.$inferSelect;
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof units.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devices.$inferSelect;
export type InsertUnitDevicePort = z.infer<typeof insertUnitDevicePortSchema>;
export type UnitDevicePort = typeof unitDevicePorts.$inferSelect;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;
