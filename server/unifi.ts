import https from "https";
import { randomBytes } from "crypto";
import { HttpsProxyAgent } from "https-proxy-agent";
import nodeFetch, { type RequestInit, type Response } from "node-fetch";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function createAgent(): https.Agent {
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  const proxyUser = process.env.PROXY_USERNAME;
  const proxyPass = process.env.PROXY_PASSWORD;

  if (proxyHost && proxyPort && proxyUser && proxyPass) {
    const trimmedUser = proxyUser.trim();
    const trimmedPass = proxyPass.trim();
    const proxyUrl = `http://${encodeURIComponent(trimmedUser)}:${encodeURIComponent(trimmedPass)}@${proxyHost}:${proxyPort}`;
    console.log(`[unifi] Using HTTP proxy at ${proxyHost}:${proxyPort}`);
    return new HttpsProxyAgent(proxyUrl);
  }

  console.log("[unifi] No proxy configured, connecting directly");
  return new https.Agent({ rejectUnauthorized: false });
}

const agent = createAgent();

function proxyFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  return nodeFetch(url, { ...opts, agent } as any);
}

interface UnifiCookie {
  value: string;
  expires: number;
}

export class UnifiClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private authCookie: UnifiCookie | null = null;
  private isUnifiOs: boolean | null = null;
  private csrfToken: string | null = null;

  constructor(url: string, username: string, password: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
  }

  private apiPrefix(): string {
    return this.isUnifiOs ? "/proxy/network" : "";
  }

  private async request(path: string, method: string = "GET", body?: any): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (this.authCookie && Date.now() < this.authCookie.expires) {
      headers["Cookie"] = this.authCookie.value;
    } else {
      await this.login();
      if (this.authCookie) {
        headers["Cookie"] = this.authCookie.value;
      }
    }

    const url = `${this.baseUrl}${this.apiPrefix()}${path}`;

    if (this.csrfToken) {
      headers["X-CSRF-Token"] = this.csrfToken;
    }

    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await proxyFetch(url, options);

    if (response.status === 401) {
      this.authCookie = null;
      await this.login();
      if (this.authCookie) {
        headers["Cookie"] = this.authCookie.value;
      }
      if (this.csrfToken) {
        headers["X-CSRF-Token"] = this.csrfToken;
      }
      const retryResponse = await proxyFetch(url, { ...options, headers });
      if (!retryResponse.ok) {
        throw new Error(`UniFi API error: ${retryResponse.status} ${retryResponse.statusText}`);
      }
      return retryResponse.json();
    }

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.authCookie = { value: setCookie.split(";")[0], expires: Date.now() + 1800000 };
    }

    const csrf = response.headers.get("x-csrf-token");
    if (csrf) {
      this.csrfToken = csrf;
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      let detail = "";
      try { const j = JSON.parse(errBody); detail = j?.meta?.msg || j?.message || j?.error || errBody.slice(0, 200); } catch { detail = errBody.slice(0, 200); }
      throw new Error(`UniFi API error: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`);
    }

    const text = await response.text();
    if (!text) return {};
    try {
      const data = JSON.parse(text);
      if (data.meta?.rc && data.meta.rc !== "ok") {
        throw new Error(`UniFi error: ${data.meta.msg || "Unknown error"}`);
      }
      return data;
    } catch (e: any) {
      if (e.message?.startsWith("UniFi error:")) throw e;
      return {};
    }
  }

  async login(): Promise<boolean> {
    const loginEndpoints = [
      { path: "/api/auth/login", unifiOs: true },
      { path: "/api/login", unifiOs: false },
    ];

    for (const endpoint of loginEndpoints) {
      try {
        console.log(`[unifi] Trying login at ${this.baseUrl}${endpoint.path}`);
        const response = await proxyFetch(`${this.baseUrl}${endpoint.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: this.username, password: this.password }),
        });

        const text = await response.text();

        if (response.status === 404) {
          continue;
        }

        if (!response.ok) {
          const detail = text ? ` - ${text.substring(0, 200)}` : "";
          console.error(`[unifi] Login failed at ${endpoint.path}: ${response.status}${detail}`);
          continue;
        }

        const setCookie = response.headers.get("set-cookie");
        if (setCookie) {
          this.authCookie = { value: setCookie.split(";")[0], expires: Date.now() + 1800000 };
        }

        const csrf = response.headers.get("x-csrf-token");
        if (csrf) {
          this.csrfToken = csrf;
        }

        this.isUnifiOs = endpoint.unifiOs;
        console.log(`[unifi] Logged in via ${endpoint.path} (UniFi OS: ${this.isUnifiOs})`);
        return true;
      } catch (error: any) {
        console.error(`[unifi] Login error at ${endpoint.path}: ${error.message}`);
        continue;
      }
    }

    console.error("[unifi] All login endpoints failed");
    return false;
  }

  async getSystemInfo(): Promise<any> {
    try {
      let result: any = {};

      if (this.isUnifiOs) {
        const response = await proxyFetch(`${this.baseUrl}/api/system`, {
          headers: {
            "Content-Type": "application/json",
            ...(this.authCookie ? { Cookie: this.authCookie.value } : {}),
            ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}),
          },
        });
        if (response.ok) {
          result = await response.json();
        }
      }

      try {
        const sysinfo = await this.request("/api/s/default/stat/sysinfo");
        const networkInfo = sysinfo?.data?.[0] || {};
        if (networkInfo.version) result.firmwareVersion = networkInfo.version;
        if (networkInfo.uptime) result.uptime = Number(networkInfo.uptime);
        if (networkInfo.hostname && !result.name) result.name = networkInfo.hostname;
      } catch {}

      return result;
    } catch {
      return {};
    }
  }

  getIsUnifiOs(): boolean {
    return this.isUnifiOs === true;
  }

  async testConnection(): Promise<{ success: boolean; message: string; sites?: any[]; systemInfo?: any; isUnifiOs?: boolean }> {
    try {
      const loggedIn = await this.login();
      if (!loggedIn) {
        return { success: false, message: "Failed to authenticate with UniFi controller. Check username/password." };
      }
      const [sites, systemInfo] = await Promise.all([this.getSites(), this.getSystemInfo()]);
      return {
        success: true,
        message: `Connected (${this.isUnifiOs ? "UniFi OS" : "Classic"}). Found ${sites.length} site(s).`,
        sites,
        systemInfo,
        isUnifiOs: this.isUnifiOs === true,
      };
    } catch (error: any) {
      return { success: false, message: `Connection failed: ${error.message}` };
    }
  }

  async getSites(): Promise<any[]> {
    try {
      const data = await this.request("/api/self/sites");
      return data?.data || [];
    } catch {
      return [];
    }
  }

  async getDevices(siteId: string = "default"): Promise<any[]> {
    try {
      const data = await this.request(`/api/s/${siteId}/stat/device`);
      return data?.data || [];
    } catch {
      return [];
    }
  }

  async createNetwork(siteId: string, name: string, vlanId: number, purpose: string = "corporate", opts?: { ipSubnet?: string; dhcpEnabled?: boolean; dhcpStart?: string; dhcpStop?: string }): Promise<any> {
    const oct2 = Math.floor(vlanId / 256);
    const oct3 = vlanId % 256;
    const body: Record<string, any> = {
      name,
      purpose,
      vlan_enabled: true,
      vlan: vlanId,
      ip_subnet: opts?.ipSubnet || `10.${oct2}.${oct3}.1/25`,
      dhcpd_enabled: opts?.dhcpEnabled ?? true,
      dhcpd_dns_enabled: false,
      networkgroup: "LAN",
    };
    if (body.dhcpd_enabled) {
      body.dhcpd_start = opts?.dhcpStart || `10.${oct2}.${oct3}.2`;
      body.dhcpd_stop = opts?.dhcpStop || `10.${oct2}.${oct3}.126`;
    }
    return this.request(`/api/s/${siteId}/rest/networkconf`, "POST", body);
  }

  async updateNetwork(siteId: string, networkId: string, updates: Record<string, any>): Promise<any> {
    return this.request(`/api/s/${siteId}/rest/networkconf/${networkId}`, "PUT", updates);
  }

  async deleteNetwork(siteId: string, networkId: string): Promise<any> {
    return this.request(`/api/s/${siteId}/rest/networkconf/${networkId}`, "DELETE");
  }

  async createWlan(siteId: string, opts: {
    name: string;
    password?: string;
    networkId?: string;
    security?: string;
    wpaMode?: string;
    enabled?: boolean;
    isGuest?: boolean;
    hideSsid?: boolean;
    bandSteering?: string;
    wlanBand?: string;
    macFilterEnabled?: boolean;
    macFilterPolicy?: string;
    macFilterList?: string[];
    radiusEnabled?: boolean;
    radiusIp1?: string;
    radiusPort1?: number;
    radiusSecret1?: string;
    vlanEnabled?: boolean;
    vlanId?: number;
    uapsdEnabled?: boolean;
    dtimMode?: string;
    dtimNa?: number;
    dtimNg?: number;
    minrateNaEnabled?: boolean;
    minrateNaDataRateKbps?: number;
    minrateNgEnabled?: boolean;
    minrateNgDataRateKbps?: number;
    fastRoamingEnabled?: boolean;
    pmfMode?: string;
    groupRekey?: number;
    bcastEnhanceEnabled?: boolean;
    l2Isolation?: boolean;
    proxyArp?: boolean;
    rateLimit?: boolean;
    rateLimitUpload?: number;
    rateLimitDownload?: number;
    schedule?: string[];
    scheduleEnabled?: boolean;
    apGroupIds?: string[];
    apGroupMode?: string;
  }): Promise<any> {
    const defaults = await this.getWlanDefaults(siteId);

    const body: any = {
      name: opts.name,
      security: opts.security || "wpapsk",
      wpa_mode: opts.wpaMode || "wpa2",
      enabled: opts.enabled ?? true,
      ap_group_mode: opts.apGroupMode || "all",
    };
    if (opts.apGroupIds && opts.apGroupIds.length > 0) {
      body.ap_group_ids = opts.apGroupIds;
      body.ap_group_mode = opts.apGroupMode || "custom";
    } else if (defaults.apGroupIds.length > 0) {
      body.ap_group_ids = defaults.apGroupIds;
    }
    if (defaults.wlangroupId) body.wlangroup_id = defaults.wlangroupId;
    if (opts.password) body.x_passphrase = opts.password;
    if (opts.networkId) body.networkconf_id = opts.networkId;
    if (opts.isGuest !== undefined) body.is_guest = opts.isGuest;
    if (opts.hideSsid !== undefined) body.hide_ssid = opts.hideSsid;
    if (opts.bandSteering) body.minrssi_enabled = false;
    if (opts.wlanBand) body.wlan_band = opts.wlanBand;
    if (opts.macFilterEnabled !== undefined) body.mac_filter_enabled = opts.macFilterEnabled;
    if (opts.macFilterPolicy) body.mac_filter_policy = opts.macFilterPolicy;
    if (opts.macFilterList) body.mac_filter_list = opts.macFilterList;
    if (opts.vlanEnabled !== undefined) body.vlan_enabled = opts.vlanEnabled;
    if (opts.vlanId !== undefined) body.vlan = String(opts.vlanId);
    if (opts.uapsdEnabled !== undefined) body.uapsd_enabled = opts.uapsdEnabled;
    if (opts.dtimMode) body.dtim_mode = opts.dtimMode;
    if (opts.dtimNa !== undefined) body.dtim_na = opts.dtimNa;
    if (opts.dtimNg !== undefined) body.dtim_ng = opts.dtimNg;
    if (opts.minrateNaEnabled !== undefined) body.minrate_na_enabled = opts.minrateNaEnabled;
    if (opts.minrateNaDataRateKbps !== undefined) body.minrate_na_data_rate_kbps = opts.minrateNaDataRateKbps;
    if (opts.minrateNgEnabled !== undefined) body.minrate_ng_enabled = opts.minrateNgEnabled;
    if (opts.minrateNgDataRateKbps !== undefined) body.minrate_ng_data_rate_kbps = opts.minrateNgDataRateKbps;
    if (opts.fastRoamingEnabled !== undefined) body.fast_roaming_enabled = opts.fastRoamingEnabled;
    if (opts.pmfMode) body.pmf_mode = opts.pmfMode;
    if (opts.groupRekey !== undefined) body.group_rekey = opts.groupRekey;
    if (opts.bcastEnhanceEnabled !== undefined) body.bcastenhance_enabled = opts.bcastEnhanceEnabled;
    if (opts.l2Isolation !== undefined) body.l2_isolation = opts.l2Isolation;
    if (opts.proxyArp !== undefined) body.proxy_arp = opts.proxyArp;
    if (opts.rateLimit !== undefined) {
      body.usergroup_id = "";
      if (opts.rateLimitUpload !== undefined) body.rate_limit_up = opts.rateLimitUpload;
      if (opts.rateLimitDownload !== undefined) body.rate_limit_down = opts.rateLimitDownload;
    }
    if (opts.scheduleEnabled !== undefined) body.schedule_enabled = opts.scheduleEnabled;
    if (opts.schedule) body.schedule = opts.schedule;
    if (opts.radiusEnabled) {
      body.security = "wpaeap";
      if (opts.radiusIp1) body.radius_ip_1 = opts.radiusIp1;
      if (opts.radiusPort1) body.radius_port_1 = opts.radiusPort1;
      if (opts.radiusSecret1) body.x_radius_secret_1 = opts.radiusSecret1;
    }
    return this.request(`/api/s/${siteId}/rest/wlanconf`, "POST", body);
  }

  async getWlanDefaults(siteId: string): Promise<{ apGroupIds: string[]; wlangroupId: string | null }> {
    let apGroupIds: string[] = [];
    let wlangroupId: string | null = null;

    try {
      const wlanGroupData = await this.request(`/api/s/${siteId}/rest/wlangroup`);
      const groups = wlanGroupData?.data || [];
      const defaultGroup = groups.find((g: any) => g.attr_no_delete || g.name === "Default") || groups[0];
      if (defaultGroup?._id) wlangroupId = defaultGroup._id;
    } catch {}

    try {
      const existingWlans = await this.getWlans(siteId);
      const wlanWithApGroup = existingWlans.find((w: any) => w.ap_group_ids?.length > 0);
      if (wlanWithApGroup) {
        apGroupIds = wlanWithApGroup.ap_group_ids;
      }
    } catch {}

    return { apGroupIds, wlangroupId };
  }

  async createPpskWlan(siteId: string, name: string, networkId: string, ppskKeys: Array<{ password: string; vlanId: number; networkConfId?: string; description: string }>, advancedOpts?: Record<string, any>): Promise<any> {
    const defaults = await this.getWlanDefaults(siteId);

    const masterPassphrase = randomBytes(16).toString('base64url');
    const body: any = {
      name,
      security: "wpapsk",
      wpa_mode: "wpa2",
      x_passphrase: masterPassphrase,
      networkconf_id: networkId,
      enabled: true,
      ap_group_mode: "all",
      private_preshared_keys_enabled: true,
      private_preshared_keys: ppskKeys.map((k) => ({
        password: k.password,
        vlan: String(k.vlanId),
        networkconf_id: k.networkConfId || networkId,
        description: k.description,
      })),
    };
    if (advancedOpts?.apGroupIds && advancedOpts.apGroupIds.length > 0) {
      body.ap_group_ids = advancedOpts.apGroupIds;
      body.ap_group_mode = advancedOpts.apGroupMode || "custom";
    } else if (defaults.apGroupIds.length > 0) {
      body.ap_group_ids = defaults.apGroupIds;
    }
    if (defaults.wlangroupId) body.wlangroup_id = defaults.wlangroupId;
    if (advancedOpts) {
      if (advancedOpts.isGuest !== undefined) body.is_guest = advancedOpts.isGuest;
      if (advancedOpts.hideSsid !== undefined) body.hide_ssid = advancedOpts.hideSsid;
      if (advancedOpts.wlanBand) body.wlan_band = advancedOpts.wlanBand;
      if (advancedOpts.macFilterEnabled !== undefined) body.mac_filter_enabled = advancedOpts.macFilterEnabled;
      if (advancedOpts.macFilterPolicy) body.mac_filter_policy = advancedOpts.macFilterPolicy;
      if (advancedOpts.macFilterList) body.mac_filter_list = advancedOpts.macFilterList;
      if (advancedOpts.uapsdEnabled !== undefined) body.uapsd_enabled = advancedOpts.uapsdEnabled;
      if (advancedOpts.bcastEnhanceEnabled !== undefined) body.bcastenhance_enabled = advancedOpts.bcastEnhanceEnabled;
      if (advancedOpts.l2Isolation !== undefined) body.l2_isolation = advancedOpts.l2Isolation;
      if (advancedOpts.proxyArp !== undefined) body.proxy_arp = advancedOpts.proxyArp;
      if (advancedOpts.fastRoamingEnabled !== undefined) body.fast_roaming_enabled = advancedOpts.fastRoamingEnabled;
      if (advancedOpts.pmfMode) body.pmf_mode = advancedOpts.pmfMode;
      if (advancedOpts.groupRekey !== undefined) body.group_rekey = advancedOpts.groupRekey;
      if (advancedOpts.dtimMode) body.dtim_mode = advancedOpts.dtimMode;
      if (advancedOpts.dtimNa !== undefined) body.dtim_na = advancedOpts.dtimNa;
      if (advancedOpts.dtimNg !== undefined) body.dtim_ng = advancedOpts.dtimNg;
    }
    return this.request(`/api/s/${siteId}/rest/wlanconf`, "POST", body);
  }

  async triggerBackup(siteId: string = "default"): Promise<{ url: string }> {
    const data = await this.request(`/api/s/${siteId}/cmd/backup`, "POST", { cmd: "backup" });
    const url = data?.data?.[0]?.url || data?.url;
    if (!url) throw new Error("Backup trigger did not return a download URL");
    return { url };
  }

  async downloadBackup(backupUrl: string): Promise<Buffer> {
    const headers: Record<string, string> = {};
    if (this.authCookie && Date.now() < this.authCookie.expires) {
      headers["Cookie"] = this.authCookie.value;
    } else {
      await this.login();
      if (this.authCookie) headers["Cookie"] = this.authCookie.value;
    }
    if (this.csrfToken) headers["X-CSRF-Token"] = this.csrfToken;

    const fullUrl = backupUrl.startsWith("http") ? backupUrl : `${this.baseUrl}${backupUrl}`;
    const response = await proxyFetch(fullUrl, { method: "GET", headers });
    if (!response.ok) throw new Error(`Backup download failed: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getNetworkDetail(siteId: string, networkId: string): Promise<any> {
    const data = await this.request(`/api/s/${siteId}/rest/networkconf/${networkId}`, "GET");
    return data?.data?.[0] || data;
  }

  async getWlanDetail(siteId: string, wlanId: string): Promise<any> {
    const data = await this.request(`/api/s/${siteId}/rest/wlanconf/${wlanId}`, "GET");
    return data?.data?.[0] || data;
  }

  async getDeviceDetail(siteId: string, deviceMac: string): Promise<any> {
    const data = await this.request(`/api/s/${siteId}/stat/device/${deviceMac}`, "GET");
    return data?.data?.[0] || data;
  }

  async getApGroups(siteId: string = "default"): Promise<any[]> {
    try {
      const data = await this.request(`/v2/api/site/${siteId}/apgroups`, "GET");
      return Array.isArray(data) ? data : (data?.data || []);
    } catch {
      const data = await this.request(`/api/s/${siteId}/rest/apgroup`, "GET");
      return data?.data || [];
    }
  }

  async createApGroup(siteId: string, name: string, deviceMacs: string[]): Promise<any> {
    try {
      return await this.request(`/v2/api/site/${siteId}/apgroups`, "POST", { name, device_macs: deviceMacs });
    } catch {
      return this.request(`/api/s/${siteId}/rest/apgroup`, "POST", { name, device_macs: deviceMacs });
    }
  }

  async updateApGroup(siteId: string, groupId: string, updates: { name?: string; device_macs?: string[] }): Promise<any> {
    try {
      return await this.request(`/v2/api/site/${siteId}/apgroups/${groupId}`, "PUT", updates);
    } catch {
      return this.request(`/api/s/${siteId}/rest/apgroup/${groupId}`, "PUT", updates);
    }
  }

  async deleteApGroup(siteId: string, groupId: string): Promise<any> {
    try {
      return await this.request(`/v2/api/site/${siteId}/apgroups/${groupId}`, "DELETE");
    } catch {
      return this.request(`/api/s/${siteId}/rest/apgroup/${groupId}`, "DELETE");
    }
  }

  async updateWlan(siteId: string, wlanId: string, updates: Record<string, any>): Promise<any> {
    return this.request(`/api/s/${siteId}/rest/wlanconf/${wlanId}`, "PUT", updates);
  }

  async updateWlanPassword(siteId: string, wlanId: string, newPassword: string): Promise<any> {
    return this.request(`/api/s/${siteId}/rest/wlanconf/${wlanId}`, "PUT", { x_passphrase: newPassword });
  }

  async deleteWlan(siteId: string, wlanId: string): Promise<any> {
    return this.request(`/api/s/${siteId}/rest/wlanconf/${wlanId}`, "DELETE");
  }

  async setPortProfile(siteId: string, deviceId: string, portIdx: number, nativeVlan: number): Promise<any> {
    const deviceData = await this.request(`/api/s/${siteId}/rest/device/${deviceId}`);
    if (!deviceData?.data?.[0]) throw new Error("Device not found");

    const device = deviceData.data[0];
    const portOverrides = device.port_overrides || [];

    const existingIdx = portOverrides.findIndex((p: any) => p.port_idx === portIdx);
    const portConfig = {
      port_idx: portIdx,
      native_networkconf_id: "",
      portconf_id: "",
      poe_mode: "auto",
      forward: "customize",
      native_vlan: nativeVlan,
    };

    if (existingIdx >= 0) {
      portOverrides[existingIdx] = { ...portOverrides[existingIdx], ...portConfig };
    } else {
      portOverrides.push(portConfig);
    }

    return this.request(`/api/s/${siteId}/rest/device/${deviceId}`, "PUT", { port_overrides: portOverrides });
  }

  async getClientStats(siteId: string = "default"): Promise<any[]> {
    try {
      const data = await this.request(`/api/s/${siteId}/stat/sta`);
      return data?.data || [];
    } catch {
      return [];
    }
  }

  async getNetworks(siteId: string = "default"): Promise<any[]> {
    const data = await this.request(`/api/s/${siteId}/rest/networkconf`);
    return data?.data || [];
  }

  async getWlans(siteId: string = "default"): Promise<any[]> {
    try {
      const data = await this.request(`/api/s/${siteId}/rest/wlanconf`);
      return data?.data || [];
    } catch {
      return [];
    }
  }
}

const clientCache = new Map<string, UnifiClient>();

export function getUnifiClient(controllerId: string, url: string, username: string, password: string): UnifiClient {
  let client = clientCache.get(controllerId);
  if (!client) {
    client = new UnifiClient(url, username, password);
    clientCache.set(controllerId, client);
  }
  return client;
}

export function clearClientCache(controllerId: string): void {
  clientCache.delete(controllerId);
}
