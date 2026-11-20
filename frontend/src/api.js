function requestPath(input) {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, window.location.origin).pathname;
}

function isSocietyScopedPath(path) {
  const isScopedMessagePath = path === "/api/auth/messages" || /^\/api\/auth\/messages\/\d+\/reply$/.test(path);
  return path.startsWith("/api/") &&
    (!path.startsWith("/api/auth/") || isScopedMessagePath) &&
    !path.startsWith("/api/assistant/") &&
    !path.includes("/proof");
}

function mergeSocietyResults(results, societies, path) {
  const named = results.map(({ society, data }) => ({ society, data }));
  if (path === "/api/dashboard") {
    const total = (key) => named.reduce((sum, { data }) => sum + Number(data[key] || 0), 0);
    const collections = new Map();
    named.forEach(({ data }) => (data.collections || []).forEach((item) => {
      collections.set(item.month, (collections.get(item.month) || 0) + Number(item.amount || 0));
    }));
    return {
      flats: ["total", "occupied", "vacant"].reduce((summary, key) => ({ ...summary, [key]: named.reduce((sum, { data }) => sum + Number(data.flats?.[key] || 0), 0) }), {}),
      residents: total("residents"),
      openComplaints: total("openComplaints"),
      upcomingBookings: total("upcomingBookings"),
      expectedVisitors: total("expectedVisitors"),
      outstanding: total("outstanding"),
      bills: total("bills"),
      collections: [...collections].map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month)),
      notices: named.flatMap(({ society, data }) => (data.notices || []).map((item) => ({ ...item, societyName: society.name }))),
    };
  }
  if (path === "/api/reports") {
    const billing = { billed: 0, collected: 0, outstanding: 0 };
    const monthly = new Map();
    const complaints = new Map();
    const occupancy = [];
    named.forEach(({ society, data }) => {
      for (const key of Object.keys(billing)) billing[key] += Number(data.billing?.[key] || 0);
      (data.monthly || []).forEach((item) => {
        const row = monthly.get(item.period) || { period: item.period, bills: 0, billed: 0, paidBills: 0 };
        row.bills += Number(item.bills || 0);
        row.billed += Number(item.billed || 0);
        row.paidBills += Number(item.paidBills || 0);
        monthly.set(item.period, row);
      });
      (data.complaints || []).forEach((item) => complaints.set(item.status, (complaints.get(item.status) || 0) + Number(item.count || 0)));
      occupancy.push(...(data.occupancy || []).map((item) => ({ ...item, block: `${society.name} · ${item.block}` })));
    });
    return {
      billing,
      monthly: [...monthly.values()].sort((a, b) => b.period.localeCompare(a.period)),
      complaints: [...complaints].map(([status, count]) => ({ status, count })),
      occupancy,
    };
  }
  if (path === "/api/notices") {
    const society = named.flatMap(({ society: item, data }) => (data.society || []).map((notice) => ({
      ...notice,
      societyId: item.id,
      societyName: item.name,
    })));
    const calendar = named[0]?.data.calendar || [];
    return {
      ...(named[0]?.data || {}),
      society,
      calendar,
      calendarAvailable: named.every(({ data }) => data.calendarAvailable !== false),
    };
  }
  if (named.every(({ data }) => Array.isArray(data))) {
    return named.flatMap(({ society, data }) => data.map((item) => ({
      ...item,
      societyId: society.id,
      societyName: society.name,
    })));
  }
  return named[0]?.data ?? [];
}

async function fetchAllSocieties(input, init, headers, path) {
  const societyHeaders = new Headers(headers);
  societyHeaders.delete("X-Society-ID");
  const societyResponse = await fetch("/api/auth/admin/societies", { headers: societyHeaders });
  const societies = await readApiJson(societyResponse);
  if (!societyResponse.ok) {
    return new Response(JSON.stringify(societies), {
      status: societyResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const responses = await Promise.all(societies.map(async (society) => {
    const scopedHeaders = new Headers(headers);
    scopedHeaders.set("X-Society-ID", String(society.id));
    const response = await fetch(input, { ...init, headers: scopedHeaders });
    const data = await readApiJson(response);
    if (!response.ok) return { response, data };
    return { society, response, data };
  }));
  const failure = responses.find((result) => !result.response.ok);
  if (failure) return new Response(JSON.stringify(failure.data), { status: failure.response.status, headers: { "Content-Type": "application/json" } });
  const merged = mergeSocietyResults(responses, societies, path);
  return new Response(JSON.stringify(merged), { status: 200, headers: { "Content-Type": "application/json" } });
}

export function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const selectedSocietyId = typeof window !== "undefined"
    ? window.localStorage.getItem("nestora-admin-society-id")
    : null;
  const path = typeof window !== "undefined" ? requestPath(input) : "";
  const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (selectedSocietyId === "all" && isSocietyScopedPath(path)) {
    if (method !== "GET") return Promise.resolve(new Response(JSON.stringify({
      message: "Community records are read-only for platform administrators.",
    }), { status: 403, headers: { "Content-Type": "application/json" } }));
    return fetchAllSocieties(input, init, headers, path);
  }
  if (selectedSocietyId && !headers.has("X-Society-ID")) headers.set("X-Society-ID", selectedSocietyId);
  return fetch(input, { ...init, headers });
}

export async function readApiJson(response) {
  const requestUrl = response.url || "";
  if (response.status === 401 && !requestUrl.includes("/api/auth/")) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("nestora:session-expired"));
    return { message: "Your session has expired. Please sign in again." };
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    if (response.status === 404) throw new Error("This feature is not available right now. Refresh the page or contact your community administrator.");
    throw new Error("We could not connect to the community service. Please try again shortly.");
  }

  try {
    return await response.json();
  } catch {
    throw new Error("The community service returned an unreadable response. Please try again.");
  }
}
