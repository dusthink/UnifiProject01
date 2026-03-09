import https from "https";
import { log } from "./index";

const agent = new https.Agent({ rejectUnauthorized: false });

interface UnifiCookie {
  value: string;
  expires: number;
}

let authCookie: UnifiCookie | null = null;

function getBaseUrl(): string {
  return process.env.UNIFI_CONTROLLER_URL || "https://localhost:8443";
}

async function unifiRequest(
  path: string,
  method: string = "GET",
  body?: any
): Promise<any> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authCookie) {
    headers["Cookie"] = authCookie.value;
  }

  const options: RequestInit = {
    method,
    headers,
    // @ts-ignore - node fetch supports agent-like options
    agent,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, {
      ...options,
      // @ts-ignore
      dispatcher: undefined,
    });

    if (response.status === 401 && authCookie) {
      authCookie = null;
      await login();
      headers["Cookie"] = authCookie!.value;
      const retryResponse = await fetch(url, { ...options, headers });
      if (!retryResponse.ok) {
        throw new Error(`UniFi API error: ${retryResponse.status} ${retryResponse.statusText}`);
      }
      const retryData = await retryResponse.json();
      if (retryData.meta?.rc && retryData.meta.rc !== "ok") {
        throw new Error(`UniFi error: ${retryData.meta.msg || "Unknown error"}`);
      }
      return retryData;
    }

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      authCookie = {
        value: setCookie.split(";")[0],
        expires: Date.now() + 1800000,
      };
    }

    if (!response.ok) {
      throw new Error(`UniFi API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.meta?.rc && data.meta.rc !== "ok") {
      throw new Error(`UniFi error: ${data.meta.msg || "Unknown error"}`);
    }

    return data;
  } catch (error: any) {
    log(`UniFi API error: ${error.message}`, "unifi");
    throw error;
  }
}

export async function login(): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    const username = process.env.UNIFI_USERNAME;
    const password = process.env.UNIFI_PASSWORD;

    if (!username || !password) {
      log("UniFi credentials not configured", "unifi");
      return false;
    }

    const response = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      // @ts-ignore
      agent,
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      authCookie = {
        value: setCookie.split(";")[0],
        expires: Date.now() + 1800000,
      };
    }

    const data = await response.json();
    if (data.meta?.rc === "ok") {
      log("Successfully authenticated with UniFi controller", "unifi");
      return true;
    }

    log(`UniFi login failed: ${JSON.stringify(data)}`, "unifi");
    return false;
  } catch (error: any) {
    log(`UniFi login error: ${error.message}`, "unifi");
    return false;
  }
}

export async function getSites(): Promise<any[]> {
  try {
    const data = await unifiRequest("/api/self/sites");
    return data?.data || [];
  } catch {
    return [];
  }
}

export async function getDevices(siteId: string = "default"): Promise<any[]> {
  try {
    const data = await unifiRequest(`/api/s/${siteId}/stat/device`);
    return data?.data || [];
  } catch {
    return [];
  }
}

export async function createNetwork(
  siteId: string,
  name: string,
  vlanId: number,
  purpose: string = "corporate"
): Promise<any> {
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

  return unifiRequest(`/api/s/${siteId}/rest/networkconf`, "POST", body);
}

export async function deleteNetwork(siteId: string, networkId: string): Promise<any> {
  return unifiRequest(`/api/s/${siteId}/rest/networkconf/${networkId}`, "DELETE");
}

export async function createWlan(
  siteId: string,
  name: string,
  password: string,
  networkId: string,
  wpaMode: string = "wpa2"
): Promise<any> {
  const body = {
    name,
    x_passphrase: password,
    networkconf_id: networkId,
    security: "wpapsk",
    wpa_mode: wpaMode,
    enabled: true,
  };

  return unifiRequest(`/api/s/${siteId}/rest/wlanconf`, "POST", body);
}

export async function createPpskWlan(
  siteId: string,
  name: string,
  networkId: string,
  ppskKeys: Array<{ password: string; vlanId: number; description: string }>
): Promise<any> {
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

  return unifiRequest(`/api/s/${siteId}/rest/wlanconf`, "POST", body);
}

export async function updateWlanPassword(
  siteId: string,
  wlanId: string,
  newPassword: string
): Promise<any> {
  return unifiRequest(`/api/s/${siteId}/rest/wlanconf/${wlanId}`, "PUT", {
    x_passphrase: newPassword,
  });
}

export async function deleteWlan(siteId: string, wlanId: string): Promise<any> {
  return unifiRequest(`/api/s/${siteId}/rest/wlanconf/${wlanId}`, "DELETE");
}

export async function setPortProfile(
  siteId: string,
  deviceId: string,
  portIdx: number,
  nativeVlan: number
): Promise<any> {
  const deviceData = await unifiRequest(`/api/s/${siteId}/rest/device/${deviceId}`);
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

  return unifiRequest(`/api/s/${siteId}/rest/device/${deviceId}`, "PUT", {
    port_overrides: portOverrides,
  });
}

export async function getClientStats(siteId: string = "default"): Promise<any[]> {
  try {
    const data = await unifiRequest(`/api/s/${siteId}/stat/sta`);
    return data?.data || [];
  } catch {
    return [];
  }
}

export async function getNetworks(siteId: string = "default"): Promise<any[]> {
  try {
    const data = await unifiRequest(`/api/s/${siteId}/rest/networkconf`);
    return data?.data || [];
  } catch {
    return [];
  }
}

export async function getWlans(siteId: string = "default"): Promise<any[]> {
  try {
    const data = await unifiRequest(`/api/s/${siteId}/rest/wlanconf`);
    return data?.data || [];
  } catch {
    return [];
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string; sites?: any[] }> {
  try {
    const loggedIn = await login();
    if (!loggedIn) {
      return { success: false, message: "Failed to authenticate with UniFi controller" };
    }
    const sites = await getSites();
    return { success: true, message: `Connected. Found ${sites.length} site(s).`, sites };
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}
