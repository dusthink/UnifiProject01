import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["admin", "tenant"]);
export const wifiModeEnum = pgEnum("wifi_mode", ["ppsk", "individual"]);
export const deviceTypeEnum = pgEnum("device_type", ["switch", "access_point", "hybrid", "gateway", "other"]);

export const controllers = pgTable("controllers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  isVerified: boolean("is_verified").default(false),
  lastConnectedAt: timestamp("last_connected_at"),
  isUnifiOs: boolean("is_unifi_os").default(false),
  hardwareModel: text("hardware_model"),
  firmwareVersion: text("firmware_version"),
  hostname: text("hostname"),
  macAddress: text("mac_address"),
  uptimeSeconds: integer("uptime_seconds"),
});

export const networks = pgTable("networks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  controllerId: varchar("controller_id").notNull(),
  name: text("name").notNull(),
  vlanId: integer("vlan_id").notNull(),
  purpose: text("purpose").default("corporate"),
  ipSubnet: text("ip_subnet"),
  dhcpEnabled: boolean("dhcp_enabled").default(true),
  dhcpStart: text("dhcp_start"),
  dhcpStop: text("dhcp_stop"),
  unifiNetworkId: text("unifi_network_id"),
  siteId: text("site_id").default("default"),
  isManaged: boolean("is_managed").default(true),
  networkIsolation: boolean("network_isolation").default(false),
});

export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  controllerId: varchar("controller_id").notNull(),
  unifiSiteId: text("unifi_site_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  deviceCount: integer("device_count").default(0),
  isDefault: boolean("is_default").default(false),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password"),
  googleId: text("google_id").unique(),
  role: roleEnum("role").notNull().default("admin"),
  unitId: varchar("unit_id"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  tosAcceptedAt: timestamp("tos_accepted_at"),
  phoneNumber: text("phone_number"),
});

export const communities = pgTable("communities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  controllerId: varchar("controller_id"),
  unifiSiteId: text("unifi_site_id").default("default"),
});

export const buildings = pgTable("buildings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  communityId: varchar("community_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  floors: integer("floors").notNull(),
});

export const units = pgTable("units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buildingId: varchar("building_id").notNull(),
  unitNumber: text("unit_number").notNull(),
  floor: integer("floor"),
  networkId: varchar("network_id"),
  vlanId: integer("vlan_id"),
  wifiMode: wifiModeEnum("wifi_mode").default("ppsk"),
  wifiSsid: text("wifi_ssid"),
  wifiPassword: text("wifi_password"),
  tenantId: varchar("tenant_id"),
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
  deviceType: deviceTypeEnum("device_type").default("other"),
  portCount: integer("port_count"),
  iconId: text("icon_id"),
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

export const wifiNetworks = pgTable("wifi_networks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  controllerId: varchar("controller_id").notNull(),
  name: text("name").notNull(),
  securityMode: text("security_mode").default("wpapsk"),
  wpaMode: text("wpa_mode").default("wpa2"),
  password: text("password"),
  networkConfId: text("network_conf_id"),
  vlanId: integer("vlan_id"),
  isGuest: boolean("is_guest").default(false),
  enabled: boolean("enabled").default(true),
  unifiWlanId: text("unifi_wlan_id"),
  siteId: text("site_id").default("default"),
  isManaged: boolean("is_managed").default(true),
});

export const backupScheduleEnum = pgEnum("backup_schedule", ["daily", "weekly", "monthly"]);

export const controllerBackups = pgTable("controller_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  controllerId: varchar("controller_id").notNull(),
  filename: text("filename").notNull(),
  fileData: text("file_data").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  schedule: text("schedule").notNull(),
});

export const controllerBackupSettings = pgTable("controller_backup_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  controllerId: varchar("controller_id").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  schedule: text("schedule").default("daily").notNull(),
  consentAcceptedAt: timestamp("consent_accepted_at"),
  consentAcceptedBy: varchar("consent_accepted_by"),
  lastBackupAt: timestamp("last_backup_at"),
  nextBackupAt: timestamp("next_backup_at"),
});

export const inviteTokens = pgTable("invite_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  unitId: varchar("unit_id").notNull(),
  email: text("email"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdBy: varchar("created_by").notNull(),
});

export const sitesRelations = relations(sites, ({ one }) => ({
  controller: one(controllers, { fields: [sites.controllerId], references: [controllers.id] }),
}));

export const networksRelations = relations(networks, ({ one }) => ({
  controller: one(controllers, { fields: [networks.controllerId], references: [controllers.id] }),
}));

export const controllersRelations = relations(controllers, ({ many }) => ({
  communities: many(communities),
  sites: many(sites),
  networks: many(networks),
}));

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  controller: one(controllers, { fields: [communities.controllerId], references: [controllers.id] }),
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

export const inviteTokensRelations = relations(inviteTokens, ({ one }) => ({
  unit: one(units, { fields: [inviteTokens.unitId], references: [units.id] }),
}));

export const insertControllerSchema = createInsertSchema(controllers).omit({ id: true });
export const insertNetworkSchema = createInsertSchema(networks).omit({ id: true });
export const insertWifiNetworkSchema = createInsertSchema(wifiNetworks).omit({ id: true });
export const insertSiteSchema = createInsertSchema(sites).omit({ id: true });
export const insertControllerBackupSchema = createInsertSchema(controllerBackups).omit({ id: true });
export const insertControllerBackupSettingsSchema = createInsertSchema(controllerBackupSettings).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertCommunitySchema = createInsertSchema(communities).omit({ id: true });
export const insertBuildingSchema = createInsertSchema(buildings).omit({ id: true });
export const insertUnitSchema = createInsertSchema(units).omit({ id: true });
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true });
export const insertUnitDevicePortSchema = createInsertSchema(unitDevicePorts).omit({ id: true });
export const insertInviteTokenSchema = createInsertSchema(inviteTokens).omit({ id: true });

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
export type InsertController = z.infer<typeof insertControllerSchema>;
export type Controller = typeof controllers.$inferSelect;
export type InsertNetwork = z.infer<typeof insertNetworkSchema>;
export type Network = typeof networks.$inferSelect;
export type InsertWifiNetwork = z.infer<typeof insertWifiNetworkSchema>;
export type WifiNetwork = typeof wifiNetworks.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;
export type InsertControllerBackup = z.infer<typeof insertControllerBackupSchema>;
export type ControllerBackup = typeof controllerBackups.$inferSelect;
export type InsertControllerBackupSettings = z.infer<typeof insertControllerBackupSettingsSchema>;
export type ControllerBackupSettings = typeof controllerBackupSettings.$inferSelect;
export type InsertInviteToken = z.infer<typeof insertInviteTokenSchema>;
export type InviteToken = typeof inviteTokens.$inferSelect;

export const loginSchema = z.object({
  username: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Display name is required"),
  tosAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms of Service" }) }),
});

export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
