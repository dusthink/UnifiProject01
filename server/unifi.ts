import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";

function createAgent(): https.Agent {
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  const proxyUser = process.env.PROXY_USERNAME;
  const proxyPass = process.env.PROXY_PASSWORD;

  if (proxyHost && proxyPort && proxyUser && proxyPass) {
    const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
    console.log(`[unifi] Using HTTP proxy at ${proxyHost}:${proxyPort}`);
    return new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
  }

  console.log("[unifi] No proxy configured, connecting directly");
  return new https.Agent({ rejectUnauthorized: false });
}

const agent = createAgent();

interface UnifiCookie {
  value: string;
  expires: number;
}

export class UnifiClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private authCookie: UnifiCookie | null = null;

  constructor(url: string, username: string, password: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
  }

  private async request(path: string, method: string = "GET", body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (this.authCookie && Date.now() < this.authCookie.expires) {
      headers["Cookie"] = this.authCookie.value;
    } else {
      await this.login();
      if (this.authCookie) {
        headers["Cookie"] = this.authCookie.value;
      }
    }

    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);

    // @ts-ignore - node fetch agent support
    options.agent = agent;

    const response = await fetch(url, options);

    if (response.status === 401) {
      this.authCookie = null;
      await this.login();
      if (this.authCookie) {
        headers["Cookie"] = this.authCookie.value;
      }
      // @ts-ignore
      const retryResponse = await fetch(url, { ...options, headers, agent });
      if (!retryResponse.ok) {
        throw new Error(`UniFi API error: ${retryResponse.status} ${retryResponse.statusText}`);
      }
      return retryResponse.json();
    }

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.authCookie = { value: setCookie.split(";")[0], expires: Date.now() + 1800000 };
    }

    if (!response.ok) {
      throw new Error(`UniFi API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.meta?.rc && data.meta.rc !== "ok") {
      throw new Error(`UniFi error: ${data.meta.msg || "Unknown error"}`);
    }
    return data;
  }

  async login(): Promise<boolean> {
    try {
      // @ts-ignore
      const response = await fetch(`${this.baseUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: this.username, password: this.password }),
        agent,
      });

      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        this.authCookie = { value: setCookie.split(";")[0], expires: Date.now() + 1800000 };
      }

      const data = await response.json();
      return data.meta?.rc === "ok";
    } catch (error: any) {
      console.error(`UniFi login error: ${error.message}`);
      return false;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string; sites?: any[] }> {
    try {
      const loggedIn = await this.login();
      if (!loggedIn) {
        return { success: false, message: "Failed to authenticate with UniFi controller" };
      }
      const sites = await this.getSites();
      return { success: true, message: `Connected. Found ${sites.length} site(s).`, sites };
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

  async createNetwork(siteId: string, name: string, vlanId: number, purpose: string = "corporate"): Promise<any> {
    const body = {
      name,
      purpose,
      vlan_enabled: true,
      vlan: vlanId,
      ip_subnet: `10.${Math.floor(vlanId / 256)}.${vlanId % 256}.1/24`,
      dhcpd_enabled: true,
      dhcpd_start: `10.${Math.floor(vlanId / 256)}.${vlanId % 256}.100`,
      dhcpd_stop: `10.${Math.floor(vlanId / 256)}.${vlanId % 256}.254`,
      dhcpd_dns_enabled: false,
      networkgroup: "LAN",
    };
    return this.request(`/api/s/${siteId}/rest/networkconf`, "POST", body);
  }

  async deleteNetwork(siteId: string, networkId: string): Promise<any> {
    return this.request(`/api/s/${siteId}/rest/networkconf/${networkId}`, "DELETE");
  }

  async createWlan(siteId: string, name: string, password: string, networkId: string, wpaMode: string = "wpa2"): Promise<any> {
    const body = {
      name,
      x_passphrase: password,
      networkconf_id: networkId,
      security: "wpapsk",
      wpa_mode: wpaMode,
      enabled: true,
    };
    return this.request(`/api/s/${siteId}/rest/wlanconf`, "POST", body);
  }

  async createPpskWlan(siteId: string, name: string, networkId: string, ppskKeys: Array<{ password: string; vlanId: number; description: string }>): Promise<any> {
    const body = {
      name,
      security: "wpapsk",
      wpa_mode: "wpa2",
      networkconf_id: networkId,
      enabled: true,
      private_preshared_keys: ppskKeys.map((k) => ({
        key: k.password,
        vlan: k.vlanId,
        description: k.description,
      })),
    };
    return this.request(`/api/s/${siteId}/rest/wlanconf`, "POST", body);
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
    try {
      const data = await this.request(`/api/s/${siteId}/rest/networkconf`);
      return data?.data || [];
    } catch {
      return [];
    }
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
