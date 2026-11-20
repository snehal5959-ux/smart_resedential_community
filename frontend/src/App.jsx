import { useEffect, useState } from "react";
import "./App.css";
import FlatsPage from "./FlatsPage";
import CommunityAssistant from "./CommunityAssistant";
import { apiFetch, readApiJson } from "./api";
import VacancyNotice from "./VacancyNotice";
import AuthScreen from "./AuthScreen";
import DataPage from "./DataPage";
import ReportsPage from "./ReportsPage";
import UserAccessPage from "./UserAccessPage";
import AdminPanel from "./AdminPanel";
import TenantsPage from "./TenantsPage";
import MessagesPage from "./MessagesPage";

/* =========================================================
   SIDEBAR MENU
   ========================================================= */

const menuItems = [
  { id: "dashboard", icon: "⌂", label: "Dashboard" },
  { id: "residents", icon: "♙", label: "Residents" },
  { id: "flats", icon: "▦", label: "Flats & Blocks" },
  { id: "amenities", icon: "✦", label: "Amenities" },
  { id: "bookings", icon: "◷", label: "Bookings" },
  { id: "maintenance", icon: "⌁", label: "Maintenance" },
  { id: "payments", icon: "₹", label: "Payments" },
  { id: "complaints", icon: "!", label: "Complaints" },
  { id: "vehicles", icon: "▱", label: "Vehicle Parking" },
  { id: "notices", icon: "▤", label: "Notices" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

menuItems.push(
  { id: "visitors", icon: "↗", label: "Visitors" },
  { id: "reports", icon: "▥", label: "Reports" },
  { id: "users", icon: "♙", label: "Account permissions" },
  { id: "tenants", icon: "♧", label: "Tenants" },
  { id: "messages", icon: "✉", label: "Messages" },
  { id: "smart-locks", icon: "♙", label: "Smart Lock Monitor" },
);

const pagePaths = {
  dashboard: "/dashboard",
  residents: "/residents",
  flats: "/flats",
  amenities: "/amenities",
  services: "/services",
  bookings: "/bookings",
  maintenance: "/maintenance",
  payments: "/payments",
  complaints: "/complaints",
  vehicles: "/vehicles",
  notices: "/notices",
  events: "/events",
  visitors: "/visitors",
  reports: "/reports",
  users: "/users",
  tenants: "/tenants",
  messages: "/messages",
  settings: "/settings",
  "smart-locks": "/smart-locks",
};

const pageMenuAliases = { services: "amenities", events: "notices", "smart-locks": "flats" };

function pageFromPath(pathname) {
  return Object.keys(pagePaths).find((page) => pagePaths[page] === pathname) || "dashboard";
}

function canAccessPage(page, user) {
  const menuPage = pageMenuAliases[page] || page;
  if (user.role === "admin") return true;
  if (menuPage === "messages") return user.role === "manager";
  if (user.role === "manager") return user.managerPermissions?.[menuPage]?.view === true;
  if (user.role === "security") return ["dashboard", "flats", "vehicles", "visitors", "notices"].includes(menuPage);
  if (user.role === "tenant") return ["dashboard", "tenants", "amenities", "bookings", "payments", "complaints", "notices"].includes(menuPage);
  return ["dashboard", "residents", "tenants", "amenities", "bookings", "payments", "complaints", "notices"].includes(menuPage);
}

function profilePhoto(gender) {
  if (gender === "male") return "/maleprofile.jpg";
  if (gender === "female") return "/femleprofile.jpg";
  return "";
}

/* =========================================================
   FLATS
   ========================================================= */



/* =========================================================
   VEHICLES
   ========================================================= */

/* =========================================================
   APP
   ========================================================= */

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    function handleExpiredSession() {
      setSessionExpired(true);
      setCurrentUser(null);
    }
    window.addEventListener("nestora:session-expired", handleExpiredSession);
    return () => window.removeEventListener("nestora:session-expired", handleExpiredSession);
  }, []);
  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const response = await apiFetch("/api/auth/session");
        const data = await readApiJson(response);
        if (response.status === 401) {
          if (active) setCurrentUser(null);
          return;
        }
        if (!response.ok) throw new Error(data.message || "Your session could not be checked.");
        if (!data.user) throw new Error("Your session could not be restored. Please try again.");
        if (active) {
          if (data.user.role !== "admin") window.localStorage.removeItem("nestora-admin-society-id");
          setCurrentUser(data.user);
        }
      } catch {
        if (active) setSessionError("We could not reach the sign-in service. Check your connection and try again.");
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void restoreSession();
    return () => { active = false; };
  }, [sessionAttempt]);
  if (checkingSession) return <main className="auth-screen"><p>Connecting to your community workspace…</p></main>;
  if (sessionError) return <main className="auth-screen"><section className="auth-card auth-status-error" role="alert"><div className="brand-mark" aria-hidden="true">N</div><h1>Sign-in unavailable</h1><p>{sessionError}</p><button className="primary-button" onClick={() => { setCheckingSession(true); setSessionError(""); setSessionAttempt((value) => value + 1); }}>Try again</button></section></main>;
  if (!currentUser) return <AuthScreen notice={sessionExpired ? "Your session has expired. Please sign in again." : ""} onSignedIn={(user) => { if (user.role !== "admin") window.localStorage.removeItem("nestora-admin-society-id"); setSessionExpired(false); setCurrentUser(user); }} />;
  if (currentUser.role === "admin") return <AdminWorkspace currentUser={currentUser} onSignOut={() => setCurrentUser(null)} />;
  return <Workspace currentUser={currentUser} onSignOut={() => setCurrentUser(null)} />;
}

function AdminWorkspace({ currentUser, onSignOut }) {
  const [societies, setSocieties] = useState([]);
  const [selectedId, setSelectedId] = useState(() => window.localStorage.getItem("nestora-admin-society-id") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch("/api/auth/admin/societies")
      .then(async (response) => {
        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.message || "Could not load societies.");
        if (!active) return;
        setSocieties(data);
        const storedId = window.localStorage.getItem("nestora-admin-society-id") || "";
        const saved = data.find((society) => String(society.id) === storedId);
        const nextId = storedId === "all" ? "all" : String(saved?.id || data[0]?.id || "");
        setSelectedId(nextId);
        if (nextId) window.localStorage.setItem("nestora-admin-society-id", nextId);
        setLoading(false);
      })
      .catch((cause) => {
        if (active) {
          setError(cause.message || "Could not load societies.");
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [reload]);

  const selectedSociety = societies.find((society) => String(society.id) === selectedId);
  const allSocietiesSelected = selectedId === "all";
  if (error) return <main className="auth-screen"><section className="auth-card" role="alert"><h1>Administrator workspace unavailable</h1><p>{error}</p></section></main>;
  if (loading) return <main className="auth-screen"><p>Loading societies…</p></main>;
  if (societies.length === 0) return <main className="main-content"><AdminPanel onSocietyCreated={() => { setError(""); setLoading(true); setReload((value) => value + 1); }} /></main>;
  if (!selectedSociety && !allSocietiesSelected) return <main className="auth-screen"><p>Loading societies…</p></main>;
  return <Workspace
    key={selectedId}
    currentUser={{ ...currentUser, societyId: allSocietiesSelected ? null : selectedSociety.id, societyName: allSocietiesSelected ? "All societies" : selectedSociety.name }}
    adminSocieties={societies}
    onAdminSocietyCreated={() => setReload((value) => value + 1)}
    onAdminSocietyChange={(id) => {
      window.localStorage.setItem("nestora-admin-society-id", id);
      setSelectedId(id);
    }}
    onSignOut={onSignOut}
  />;
}

function Workspace({ currentUser, adminSocieties = [], onAdminSocietyChange, onAdminSocietyCreated, onSignOut }) {
  const [activePage, setActivePage] = useState(() => {
    const page = pageFromPath(window.location.pathname);
    return canAccessPage(page, currentUser)
      ? page
      : menuItems.find((item) => canAccessPage(item.id, currentUser))?.id || "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [dimTheme, setDimTheme] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationError, setNotificationError] = useState("");
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [searchFlats, setSearchFlats] = useState([]);
  const [searchFlatsTerm, setSearchFlatsTerm] = useState("");
  const [searchRecords, setSearchRecords] = useState([]);
  const [searchIndexLoaded, setSearchIndexLoaded] = useState(false);
  const [searchIndexLoading, setSearchIndexLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [flatSearchError, setFlatSearchError] = useState("");
  const [pageAction, setPageAction] = useState(null);
  const [residentList, setResidentList] = useState([]);
  const [residentsLoading, setResidentsLoading] = useState(true);
  const [residentsError, setResidentsError] = useState("");
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function loadResidents() {
      if (!["admin", "manager", "resident", "tenant"].includes(currentUser.role) ||
        (currentUser.role === "manager" && currentUser.managerPermissions?.residents?.view !== true)) {
        setResidentsLoading(false);
        return;
      }
      try {
        const response = await apiFetch("/api/residents");
        const data = await readApiJson(response);

        if (!response.ok) {
          throw new Error(data.message || "Could not load residents.");
        }

        if (isCurrent) {
          setResidentList(data);
          setResidentsError("");
        }
      } catch (error) {
        if (isCurrent) {
          setResidentsError(error.message || "Could not connect to the database.");
        }
      } finally {
        if (isCurrent) {
          setResidentsLoading(false);
        }
      }
    }

    loadResidents();

    return () => {
      isCurrent = false;
    };
  }, [currentUser]);

  useEffect(() => {
    function syncPageFromUrl() {
      const page = pageFromPath(window.location.pathname);
      if (!canAccessPage(page, currentUser)) {
        const fallback = menuItems.find((item) => canAccessPage(item.id, currentUser))?.id || "dashboard";
        window.history.replaceState({}, "", pagePaths[fallback] || "/");
        setActivePage(fallback);
      } else {
        setActivePage(page);
      }
      setPageAction(null);
    }
    window.addEventListener("popstate", syncPageFromUrl);
    return () => window.removeEventListener("popstate", syncPageFromUrl);
  }, [currentUser]);

  useEffect(() => {
    const page = pageFromPath(window.location.pathname);
    if (!canAccessPage(page, currentUser)) {
      const fallback = menuItems.find((item) => canAccessPage(item.id, currentUser))?.id || "dashboard";
      if (window.location.pathname !== (pagePaths[fallback] || "/")) {
        window.history.replaceState({}, "", pagePaths[fallback] || "/");
      }
    }
  }, [currentUser]);

  const roleLabels = { admin: "Administrator", manager: "Community manager", resident: "Resident", tenant: "Tenant", security: "Security" };
  const visibleMenu = menuItems.filter((item) => {
    if (currentUser.role === "admin") return true;
    if (item.id === "messages") return currentUser.role === "manager";
    if (currentUser.role === "manager") return currentUser.managerPermissions?.[pageMenuAliases[item.id] || item.id]?.view === true;
    if (currentUser.role === "security") return ["dashboard", "flats", "vehicles", "visitors", "notices"].includes(item.id);
    if (currentUser.role === "tenant") return ["dashboard", "tenants", "amenities", "bookings", "payments", "complaints", "notices"].includes(item.id);
    return ["dashboard", "residents", "tenants", "amenities", "bookings", "payments", "complaints", "notices"].includes(item.id);
  }).map((item) => {
    if (currentUser.role === "resident" && item.id === "residents") return { ...item, label: "My profile" };
    if (currentUser.role === "security" && item.id === "flats") return { ...item, label: "Unit directory" };
    return item;
  });
  const activeMenuPage = pageMenuAliases[activePage] || activePage;
  const activeLabel = visibleMenu.find((item) => item.id === activeMenuPage)?.label || "Dashboard";

  function navigate(page, action = null) {
    const menuPage = pageMenuAliases[page] || page;
    if (!visibleMenu.some((item) => item.id === menuPage)) return;
    const nextPath = pagePaths[page] || pagePaths[menuPage];
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    setActivePage(page);
    setPageAction(action ? { page: menuPage, action } : null);
    setSidebarOpen(false);
    setSearch("");
    setSearchFlats([]);
    setShowNotifications(false);
    setShowProfile(false);
  }

  async function toggleNotifications() {
    const shouldOpen = !showNotifications;
    setShowNotifications(shouldOpen);
    setShowProfile(false);
    if (!shouldOpen) return;
    setNotificationLoading(true);
    setNotificationError("");
    try {
      const response = await apiFetch("/api/notices");
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not load notifications.");
      const notices = [
        ...(data.society || []).filter((item) => item.status === "Published"),
        ...(data.calendar || []),
      ].sort((a, b) => new Date(b.publishedAt || b.date || b.createdAt || 0) - new Date(a.publishedAt || a.date || a.createdAt || 0));
      setNotificationItems(notices.slice(0, 5));
    } catch (error) {
      setNotificationError(error.message || "Could not load notifications.");
    } finally {
      setNotificationLoading(false);
    }
  }

  useEffect(() => {
    if (search.trim().length < 2) return undefined;
    if (!["admin", "manager", "security"].includes(currentUser.role)) return undefined;
    if (currentUser.role === "manager" && currentUser.managerPermissions?.flats?.view !== true) return undefined;
    let active = true;
    const endpoint = currentUser.role === "security" ? "/api/flats/security-directory" : "/api/flats";
    const timeout = window.setTimeout(async () => {
      try {
        const response = await apiFetch(endpoint);
        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.message || "Could not search flats.");
        if (active) {
          setSearchFlats(data.filter((flat) => `${flat.flat} ${flat.block} ${flat.residents || ""}`.toLowerCase().includes(search.trim().toLowerCase())));
          setSearchFlatsTerm(search.trim().toLowerCase());
          setFlatSearchError("");
        }
      } catch (error) {
        if (active) setFlatSearchError(error.message || "Could not search flats.");
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [currentUser, search]);

  useEffect(() => {
    if (search.trim().length < 2 || searchIndexLoaded) return undefined;
    let active = true;
    const commonEndpoints = [
      ["/api/amenities", "services", (row) => `${row.name} ${row.description || ""} ${row.status || ""}`],
      ["/api/notices", "notices", (row) => `${row.title} ${row.description || ""} ${row.status || ""}`],
      ["/api/visitors", "visitors", (row) => `${row.name} ${row.purpose || ""} ${row.flat || ""} ${row.block || ""} ${row.status || ""}`],
    ];
    const roleEndpoints = ["admin", "manager", "resident", "tenant"].includes(currentUser.role)
      ? [
        ...commonEndpoints,
        ["/api/bookings", "bookings", (row) => `${row.amenity || ""} ${row.resident || ""} ${row.status || ""} ${row.startAt || ""}`],
        ["/api/complaints", "complaints", (row) => `${row.subject || ""} ${row.category || ""} ${row.description || ""} ${row.status || ""}`],
        ["/api/maintenance", ["resident", "tenant"].includes(currentUser.role) ? "payments" : "maintenance", (row) => `${row.flat || ""} ${row.block || ""} ${row.period || ""} ${row.status || ""}`],
        ["/api/payments", "payments", (row) => `${row.receipt || ""} ${row.paidBy || ""} ${row.flat || ""} ${row.period || ""} ${row.reference || ""}`],
      ]
      : commonEndpoints;
    const permittedEndpoints = currentUser.role === "manager"
      ? roleEndpoints.filter(([, page]) => canAccessPage(page, currentUser))
      : roleEndpoints;

    async function loadSearchIndex() {
      setSearchIndexLoading(true);
      const results = await Promise.allSettled(permittedEndpoints.map(async ([url, page]) => {
        const response = await apiFetch(url);
        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.message || `Could not search ${page}.`);
        return { page, data };
      }));
      if (!active) return;
      const records = [];
      const errors = [];
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          errors.push(result.reason.message || `Could not search ${permittedEndpoints[index][1]}.`);
          return;
        }
        const { page, data } = result.value;
        if (page === "notices") {
          (data.society || []).forEach((row) => records.push({ id: `notice-${row.id}`, page, title: row.title, detail: `Community notice · ${row.status}`, haystack: `${row.title} ${row.description || ""} ${row.status || ""}` }));
          (data.calendar || []).forEach((row) => records.push({ id: row.id, page: "events", title: row.title, detail: `Calendar · ${row.date}`, haystack: `${row.title} ${row.description || ""} ${row.date || ""}` }));
          return;
        }
        data.forEach((row) => {
          const text = permittedEndpoints[index][2](row);
          const title = row.name || row.subject || row.amenity || row.receipt || `${row.block || ""} ${row.flat || ""}`.trim() || row.period;
          const detail = page === "visitors"
            ? `${row.purpose} · ${row.block} ${row.flat}`
            : page === "services"
              ? `Amenity · ${row.status || "Available"}`
              : page === "maintenance"
                ? `Bill · ${row.period} · balance ₹${row.balance}`
                : `${page[0].toUpperCase()}${page.slice(1)} record`;
          records.push({ id: `${page}-${row.id}`, page, title, detail, haystack: text });
        });
      });
      setSearchRecords(records);
      setSearchError(errors.length ? `Some records could not be searched: ${errors.join(" ")}` : "");
      setSearchIndexLoaded(true);
      setSearchIndexLoading(false);
    }

    const timeout = window.setTimeout(() => { void loadSearchIndex(); }, 350);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [currentUser, search, searchIndexLoaded]);

  async function signOut() {
    setSignOutError("");
    try {
      const response = await apiFetch("/api/auth/logout", { method: "POST" });
      const data = await readApiJson(response);
      if (!response.ok && response.status !== 401) throw new Error(data.message || "Sign-out could not be completed.");
      onSignOut();
    } catch {
      setSignOutError("We could not sign you out. Check your connection and try again.");
    }
  }

  const filteredResidents = residentList.filter((resident) =>
    `${resident.name} ${resident.email} ${resident.flat} ${resident.phone}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const searchTerm = search.trim().toLowerCase();
  const matchingResidents = searchTerm.length >= 2
    ? residentList.filter((resident) => `${resident.name} ${resident.email} ${resident.flat} ${resident.block} ${resident.phone}`.toLowerCase().includes(searchTerm)).slice(0, 5)
    : [];
  const matchingRecords = searchTerm.length >= 2
    ? searchRecords.filter((record) => record.haystack.toLowerCase().includes(searchTerm) && visibleMenu.some((item) => item.id === (pageMenuAliases[record.page] || record.page))).slice(0, 8)
    : [];
  const showSearchResults = searchTerm.length >= 2;

  return (
    <div className={`app-shell${dimTheme ? " is-dim-theme" : ""}`}>

      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>

        <div className="brand">
          <div className="brand-mark">N</div>

          <div>
            <h2>Nestora</h2>
            <span>Smart Living, Together.</span>
          </div>

          <button
            className="close-sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="society-card">
          <div className="society-icon">⌂</div>

          <div>
            <strong>{currentUser.societyName || "Sunrise Residency"}</strong>
            {currentUser.role === "admin" ? <select aria-label="Select society" value={window.localStorage.getItem("nestora-admin-society-id") || currentUser.societyId || ""} onChange={(event) => onAdminSocietyChange(event.target.value)}>
              <option value="all">All societies</option>
              {adminSocieties.map((society) => <option key={society.id} value={society.id}>{society.name}</option>)}
            </select> : <span>Active Society</span>}
          </div>

          <span className="society-dot">●</span>
        </div>

        <nav className="navigation">
          <p className="nav-heading">MAIN MENU</p>

          {visibleMenu.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>

              <span>{item.label}</span>

              {item.badge && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">

          <div className="help-card">
            <div className="help-icon">?</div>

            <strong>Need help?</strong>

            <p>
              Contact the society administrator for support.
            </p>

            <button
              onClick={() =>
                alert("Support: admin@nestora.com")
              }
            >
              Contact Support →
            </button>
          </div>

          <div className="sidebar-user">

            <div className="avatar">
              {profilePhoto(currentUser.gender)
                ? <img src={profilePhoto(currentUser.gender)} alt="" />
                : currentUser.name.slice(0, 2).toUpperCase()}
            </div>

            <div>
              <strong>{currentUser.name}</strong>
              <span>{roleLabels[currentUser.role] || "Community member"}</span>
            </div>

            <button
              onClick={() => setShowProfile(!showProfile)}
            >
              ⋮
            </button>

            {showProfile && (
              <div className="profile-popup">
                <strong>{currentUser.name}'s account</strong>
                <p>{currentUser.email}</p>

                {currentUser.role === "admin" && <button
                  onClick={() => {
                    setShowProfile(false);
                    navigate("settings");
                  }}
                >
                  Account Settings
                </button>}
              </div>
            )}

          </div>

        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* =====================================================
          MAIN
          ===================================================== */}

      <main className="main-content" aria-label={`${activeLabel} page`}>
        {currentUser.role === "admin" && window.localStorage.getItem("nestora-admin-society-id") === "all" && <p className="calendar-source-note" role="status">All societies view · community modules are read-only. Use Account permissions to add a society or manager.</p>}

        <header className="topbar">

          <button
            className="menu-toggle"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="topbar-search-wrap">
          <div className="topbar-search">
            <span className="search-icon">⌕</span>
            <input
              placeholder="Search residents, flats..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchError(""); setFlatSearchError(""); }}
              aria-label="Search residents and flats"
            />
          </div>
          {showSearchResults && <div className="search-results-panel" role="listbox" aria-label="Search results">
            {matchingRecords.map((record) => (
              <button key={record.id} type="button" className="search-result" onClick={() => navigate(record.page)}>
                <span className="search-result-icon">{record.page === "events" ? "▤" : "⌕"}</span>
                <span><strong>{record.title || "Community record"}</strong><small>{record.detail}</small></span>
              </button>
            ))}
            {matchingResidents.map((resident) => (
              <button key={`resident-${resident.id}`} type="button" className="search-result" onClick={() => navigate("residents")}>
                <span className="search-result-icon">♙</span>
                <span><strong>{resident.name}</strong><small>{resident.block} · {resident.flat} · Resident</small></span>
              </button>
            ))}
            {searchFlatsTerm === searchTerm && searchFlats.map((flat) => (
              <button key={`flat-${flat.id}`} type="button" className="search-result" onClick={() => navigate(currentUser.role === "security" ? "flats" : "flats")}>
                <span className="search-result-icon">▦</span>
                <span><strong>{flat.block} · {flat.flat}</strong><small>{flat.residents || flat.occupancy || "Flat"} · {flat.status || ""}</small></span>
              </button>
            ))}
            {(searchError || flatSearchError) && <p className="search-results-error" role="alert">{[searchError, flatSearchError].filter(Boolean).join(" ")}</p>}
            {searchIndexLoading && matchingRecords.length === 0 && <p className="search-results-empty">Searching community records…</p>}
            {!searchIndexLoading && !searchError && matchingResidents.length === 0 && matchingRecords.length === 0 && searchFlats.length === 0 && <p className="search-results-empty">No matching records.</p>}
          </div>}
          </div>

          <div className="topbar-actions">
            {(currentUser.role !== "manager" || currentUser.managerPermissions?.notices?.view === true) && <button className="icon-button notification-button" type="button" aria-label="Notifications" aria-expanded={showNotifications} onClick={() => void toggleNotifications()}>
              <span className="notification-bell">◔</span>
              <span className="notification-dot" />
            </button>}
            <button className="icon-button theme-button" type="button" aria-label={dimTheme ? "Switch to light theme" : "Switch to dim theme"} aria-pressed={dimTheme} onClick={() => setDimTheme((current) => !current)}>
              ☼
            </button>
            <button className="top-user-avatar" type="button" title={`${currentUser.name} · ${roleLabels[currentUser.role] || currentUser.role}`} aria-label="Open profile menu" aria-expanded={showProfile} onClick={() => { setShowProfile((open) => !open); setShowNotifications(false); }}>
              {profilePhoto(currentUser.gender)
                ? <img src={profilePhoto(currentUser.gender)} alt="" />
                : currentUser.name.slice(0, 2).toUpperCase()}
            </button>
            {showNotifications && <div className="notifications-popup" role="dialog" aria-label="Community notifications">
              <div className="popup-heading"><strong>Community notifications</strong><button type="button" aria-label="Close notifications" onClick={() => setShowNotifications(false)}>×</button></div>
              {notificationLoading ? <p>Loading notices…</p> : notificationError ? <p className="popup-error" role="alert">{notificationError}</p> : notificationItems.length === 0 ? <p>No published notices or upcoming calendar events.</p> : <div className="notification-list">{notificationItems.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.source === "calendar" ? "events" : "notices")}><strong>{item.title}</strong><small>{item.date || (item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Community notice")}</small></button>)}</div>}
              <button type="button" className="notification-view-all" onClick={() => navigate("notices")}>View notices and calendar →</button>
            </div>}
            {showProfile && <div className="top-profile-popup" role="menu">
              <strong>{currentUser.name}</strong>
              <span>{currentUser.email}</span>
              {currentUser.role === "admin" && <button type="button" role="menuitem" onClick={() => navigate("settings")}>Account settings</button>}
              <button type="button" role="menuitem" onClick={() => void signOut()}>Sign out</button>
            </div>}
            {signOutError && <span className="auth-inline-error" role="alert">{signOutError}</span>}
          </div>
        </header>

        <div className="page-content">
          {currentUser.role === "manager" && visibleMenu.length === 0 && <section className="panel resident-home-panel"><h1>No modules assigned</h1><p>Contact your platform administrator to request access to your society’s modules.</p></section>}

          {/* =================================================
              DASHBOARD
              ================================================= */}

          {activePage === "dashboard" && canAccessPage("dashboard", currentUser) && (
            <>
              <Dashboard
                navigate={navigate}
                currentUser={currentUser}
                residents={residentList}
                residentsLoading={residentsLoading}
                residentsError={residentsError}
              />
            </>
          )}

          {/* =================================================
              RESIDENTS
              ================================================= */}

          {activePage === "residents" && ["admin", "manager", "resident"].includes(currentUser.role) && (
            <ResidentPage
              role={currentUser.role}
              permissions={currentUser.managerPermissions}
              residents={filteredResidents}
              search={search}
              setSearch={setSearch}
              residentList={residentList}
              setResidentList={setResidentList}
              loading={residentsLoading}
              error={residentsError}
              openForm={pageAction?.page === "residents" && pageAction.action === "create"}
            />
          )}

          {/* =================================================
              FLATS
              ================================================= */}

          {activePage === "flats" && (currentUser.role === "security" ? <DataPage resource="securityUnits" role={currentUser.role} /> : <FlatsPage role={currentUser.role} permissions={currentUser.managerPermissions} />)}
          {activePage === "smart-locks" && <FlatsPage role={currentUser.role} permissions={currentUser.managerPermissions} />}

          {/* =================================================
              AMENITIES
              ================================================= */}

          {(activePage === "amenities" || activePage === "services") && <DataPage resource="amenities" role={currentUser.role} permissions={currentUser.managerPermissions} />}

          {/* =================================================
              BOOKINGS
              ================================================= */}

          {activePage === "bookings" && <DataPage resource="bookings" role={currentUser.role} permissions={currentUser.managerPermissions} openForm={pageAction?.page === "bookings" && pageAction.action === "create"} />}

          {/* =================================================
              MAINTENANCE
              ================================================= */}

          {activePage === "maintenance" && (
            <DataPage resource="maintenance" role={currentUser.role} permissions={currentUser.managerPermissions} />
          )}

          {/* =================================================
              PAYMENTS
              ================================================= */}

          {activePage === "payments" && (
            <DataPage resource="payments" role={currentUser.role} permissions={currentUser.managerPermissions} openForm={pageAction?.page === "payments" && pageAction.action === "create" && !["resident", "tenant"].includes(currentUser.role)} />
          )}

          {/* =================================================
              COMPLAINTS
              ================================================= */}

          {activePage === "complaints" && <DataPage resource="complaints" role={currentUser.role} permissions={currentUser.managerPermissions} openForm={pageAction?.page === "complaints" && pageAction.action === "create"} />}

          {/* =================================================
              VEHICLES
              ================================================= */}

          {activePage === "vehicles" && <DataPage resource="vehicles" role={currentUser.role} permissions={currentUser.managerPermissions} />}

          {/* =================================================
              NOTICES
              ================================================= */}

          {(activePage === "notices" || activePage === "events") && <DataPage resource="notices" role={currentUser.role} permissions={currentUser.managerPermissions} />}

          {/* =================================================
              SETTINGS
              ================================================= */}

          {activePage === "visitors" && <DataPage resource="visitors" role={currentUser.role} permissions={currentUser.managerPermissions} />}
          {activePage === "reports" && <ReportsPage />}
          {activePage === "users" && currentUser.role === "admin" && <AdminPanel currentUser={currentUser} onSocietyCreated={onAdminSocietyCreated} />}
          {activePage === "users" && currentUser.role === "manager" && <UserAccessPage role={currentUser.role} permissions={currentUser.managerPermissions} />}
          {activePage === "tenants" && <TenantsPage currentUser={currentUser} />}
          {activePage === "messages" && <MessagesPage currentUser={currentUser} />}

          {activePage === "settings" && currentUser.role === "admin" && (
            <SettingsPage currentUser={currentUser} />
          )}

        </div>
      </main>
      {!["admin", "manager"].includes(currentUser.role) && <CommunityAssistant />}
    </div>
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function Dashboard({ navigate, currentUser, residents, residentsLoading, residentsError }) {

  const allSocietiesView = typeof window !== "undefined" && window.localStorage.getItem("nestora-admin-society-id") === "all";
  const [flatSummary, setFlatSummary] = useState(null);
  const [chartPeriod, setChartPeriod] = useState(6);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [dashboardEvents, setDashboardEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [recentVisitors, setRecentVisitors] = useState([]);
  const [visitorsLoading, setVisitorsLoading] = useState(true);
  const [visitorsError, setVisitorsError] = useState("");
  const [selectedDetails, setSelectedDetails] = useState(null);

  const collectionMonths = flatSummary && !flatSummary.error
    ? Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - 5 + index);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const record = flatSummary.collections?.find((collection) => collection.month === month);
      return {
        month,
        amount: Number(record?.amount || 0),
        label: date.toLocaleString(undefined, { month: "short" }),
      };
    })
    : [];
  const visibleCollections = collectionMonths.slice(-chartPeriod);
  const maxCollection = Math.max(...visibleCollections.map(({ amount }) => amount), 0);
  const collectionTotal = visibleCollections.reduce((total, { amount }) => total + amount, 0);
  const chartPoints = visibleCollections.map((item, index) => ({
    ...item,
    x: visibleCollections.length === 1 ? 210 : 10 + index * (400 / (visibleCollections.length - 1)),
    y: maxCollection ? 155 - (item.amount / maxCollection) * 125 : 155,
  }));
  const chartLine = chartPoints.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const chartArea = chartPoints.length ? `${chartLine} L${chartPoints.at(-1).x},175 L${chartPoints[0].x},175 Z` : "";
  const chartAxisLabels = [1, 0.75, 0.5, 0.25, 0].map((fraction) => Math.round(maxCollection * fraction));

  useEffect(() => {
    let current = true;
    if (["resident", "tenant", "security"].includes(currentUser.role)) return () => { current = false; };
    apiFetch("/api/dashboard")
      .then(readApiJson)
      .then((summary) => {
        if (!current) return;
        setFlatSummary({ ...summary, total: summary.flats.total, occupied: summary.flats.occupied, vacant: summary.flats.vacant });
      })
      .catch((error) => {
        if (current) setFlatSummary({ error: error.message });
      });
    return () => { current = false; };
  }, [currentUser.role]);

  useEffect(() => {
    if (["resident", "tenant", "security"].includes(currentUser.role)) return undefined;
    let active = true;
    async function loadDashboardItems() {
      const canLoadNotices = currentUser.role !== "manager" || currentUser.managerPermissions?.notices?.view === true;
      const canLoadVisitors = currentUser.role !== "manager" || currentUser.managerPermissions?.visitors?.view === true;
      const requests = [];
      const noticesIndex = canLoadNotices ? requests.push(apiFetch("/api/notices").then(async (response) => {
          const data = await readApiJson(response);
          if (!response.ok) throw new Error(data.message || "Could not load upcoming events.");
          return data;
        })) - 1 : -1;
      const visitorsIndex = canLoadVisitors ? requests.push(apiFetch("/api/visitors").then(async (response) => {
          const data = await readApiJson(response);
          if (!response.ok) throw new Error(data.message || "Could not load recent activity.");
          return data;
        })) - 1 : -1;
      const results = await Promise.allSettled(requests);
      if (!active) return;
      const noticesResult = noticesIndex === -1 ? null : results[noticesIndex];
      const visitorsResult = visitorsIndex === -1 ? null : results[visitorsIndex];
      if (noticesResult?.status === "fulfilled") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setDashboardEvents((noticesResult.value.calendar || [])
          .filter((item) => new Date(`${item.date}T00:00:00`) >= today)
          .slice(0, 3));
        setEventsError("");
      } else if (noticesResult) {
        setEventsError(noticesResult.reason.message || "Could not load upcoming events.");
      } else {
        setEventsLoading(false);
      }
      if (visitorsResult?.status === "fulfilled") {
        setRecentVisitors(visitorsResult.value
          .sort((a, b) => new Date(b.checkedInAt || b.expectedAt || 0) - new Date(a.checkedInAt || a.expectedAt || 0))
          .slice(0, 3));
        setVisitorsError("");
      } else if (visitorsResult) {
        setVisitorsError(visitorsResult.reason.message || "Could not load recent activity.");
      } else {
        setVisitorsLoading(false);
      }
      setEventsLoading(false);
      setVisitorsLoading(false);
    }
    void loadDashboardItems();
    return () => { active = false; };
  }, [currentUser]);

  if (["resident", "tenant", "security"].includes(currentUser.role)) {
    const isResident = ["resident", "tenant"].includes(currentUser.role);
    return <>
      <section className="welcome-row">
        <div><p className="eyebrow">{isResident ? "RESIDENT HOME" : "SECURITY DESK"}</p><h1>Welcome back, {currentUser.name}</h1><p className="welcome-subtitle">{isResident ? "View your community profile, bookings, requests, and published notices." : "Open the visitor log or review published community notices."}</p></div>
      </section>
      <section className="panel resident-home-panel">
        <h2>{isResident ? "Your community" : "Security workspace"}</h2>
        <p>{isResident ? "Choose an area to view or manage your information." : "Choose a permitted area to continue."}</p>
        <div className="resident-home-actions">
          {isResident ? <>
            {currentUser.role === "resident"
              ? <button className="secondary-button" onClick={() => navigate("residents")}>View my profile</button>
              : <button className="secondary-button" onClick={() => navigate("tenants")}>View my tenant details</button>}
            <button className="secondary-button" onClick={() => navigate("bookings")}>My amenity bookings</button>
            <button className="secondary-button" onClick={() => navigate("payments")}>View and pay bills</button>
            <button className="secondary-button" onClick={() => navigate("complaints")}>My complaints</button>
            <button className="secondary-button" onClick={() => navigate("notices")}>Community notices</button>
          </> : <>
            <button className="secondary-button" onClick={() => navigate("visitors")}>Visitor log</button>
            <button className="secondary-button" onClick={() => navigate("flats")}>Read-only unit directory</button>
            <button className="secondary-button" onClick={() => navigate("notices")}>Community notices</button>
          </>}
        </div>
      </section>
    </>;
  }

  const templateStats = [
    {
      key: "residents",
      label: "Total Residents",
      value: flatSummary && !flatSummary.error ? String(flatSummary.residents) : residentsLoading || residentsError ? "—" : String(residents.length),
      growth: flatSummary?.error || residentsError ? "Unavailable" : "Current total",
      tone: "metric-green",
      icon: "👥",
      page: "residents",
    },
    {
      key: "flats",
      label: "Occupied Flats",
      value: flatSummary && !flatSummary.error ? String(flatSummary.occupied ?? flatSummary.total ?? 0) : "—",
      growth: flatSummary?.error ? "Unavailable" : "Current occupancy",
      tone: "metric-peach",
      image: "/occupied_flats.jpg",
      icon: "🏠",
      page: "flats",
    },
    {
      key: "bookings",
      label: "Upcoming Bookings",
      value: flatSummary && !flatSummary.error ? String(flatSummary.upcomingBookings ?? 0) : "—",
      growth: flatSummary?.error ? "Unavailable" : "Upcoming",
      tone: "metric-lavender",
      image: "/upcoming_booking.jpg",
      icon: "📅",
      page: "bookings",
    },
    {
      key: "complaints",
      label: "Pending Complaints",
      value: flatSummary && !flatSummary.error ? String(flatSummary.openComplaints ?? 0) : "—",
      growth: flatSummary?.error ? "Unavailable" : "Open",
      tone: "metric-cyan",
      image: "/track_complaints.jpg",
      icon: "🛠",
      page: "complaints",
    },
  ];

  return (
    <div className="dashboard-snap">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-pill">Welcome to Nestora</div>
          <h1>Welcome back, {currentUser.name}!</h1>
          <p>Your community, running smoothly.</p>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-building" />
          <div className="hero-watermark">Smarter Homes<br />Happier Community</div>
        </div>
      </section>
      <VacancyNotice onExplore={() => navigate("flats")} />

      <section className="stats-row">
        {templateStats.map((stat) => (
          <button key={stat.key} type="button" className={`metric-card metric-card-button ${stat.tone}`} onClick={() => navigate(stat.page)} aria-label={`${stat.label}: ${stat.value}. Open ${stat.page}`}>
            {stat.image && <img className="metric-photo" src={stat.image} alt="" />}
            <div className="metric-icon">{stat.icon}</div>
            <div className="metric-value">{stat.value}</div>
            <div className="metric-label">{stat.label}</div>
            <div className="metric-trend up">{stat.growth}</div>
          </button>
        ))}
      </section>

      <section className="dashboard-grid-snap">
        <div className="panel overview-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <span className="panel-icon mini-chart">📈</span>
              <h2>Community Overview</h2>
            </div>
            <label className="chart-period-label">
              <span className="visually-hidden">Chart period</span>
              <select value={chartPeriod} onChange={(event) => { setChartPeriod(Number(event.target.value)); setHoveredPoint(null); }}>
                <option value="1">This Month</option>
                <option value="3">Last 3 Months</option>
                <option value="6">Last 6 Months</option>
              </select>
            </label>
          </div>

          <div className="chart-box">
            <div className="chart-y-labels">
              {chartAxisLabels.map((value, index) => <span key={index}>₹{value.toLocaleString()}</span>)}
            </div>
            <div className="chart-surface" onMouseLeave={() => setHoveredPoint(null)}>
              {flatSummary?.error ? <p className="chart-status" role="alert">{flatSummary.error}</p> : chartPoints.length === 0 ? <p className="chart-status">{flatSummary ? "No payment collection data is available for this period." : "Loading community data…"}</p> : <>
              <svg viewBox="0 0 420 180" preserveAspectRatio="none" role="img" aria-label={`Community payments over the last ${chartPeriod} ${chartPeriod === 1 ? "month" : "months"}`}>
                <path d={chartArea} fill="rgba(72,197,126,0.12)" />
                <path d={chartLine} fill="none" stroke="#1fb36b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {chartPoints.map((point, index) => (
                  <circle
                    key={point.month}
                    cx={point.x}
                    cy={point.y}
                    r={hoveredPoint === index ? 7 : 5}
                    fill="#16885c"
                    stroke="#fff"
                    strokeWidth="3"
                    tabIndex="0"
                    role="button"
                    aria-label={`${point.label} collections: ₹${point.amount.toLocaleString()}`}
                    onMouseEnter={() => setHoveredPoint(index)}
                    onFocus={() => setHoveredPoint(index)}
                    onBlur={() => setHoveredPoint(null)}
                  >
                    <title>{point.label}: ₹{point.amount.toLocaleString()}</title>
                  </circle>
                ))}
              </svg>
              <div className="chart-grid-line line-1" />
              <div className="chart-grid-line line-2" />
              <div className="chart-grid-line line-3" />
              <div className="chart-grid-line line-4" />
              <div className="chart-x-labels">
                {chartPoints.map((point) => <span key={point.month}>{point.label}</span>)}
              </div>
              {hoveredPoint !== null && chartPoints[hoveredPoint] && <div className="chart-tooltip" style={{ left: `${chartPoints[hoveredPoint].x / 4.2}%`, top: `${Math.max(0, chartPoints[hoveredPoint].y / 1.8 - 28)}%` }}>
                <strong>{chartPoints[hoveredPoint].label}</strong>
                <span>₹{chartPoints[hoveredPoint].amount.toLocaleString()}</span>
              </div>}
              </>}
            </div>
          </div>
          <div className="chart-footer">
            <div className="chart-total">{flatSummary && !flatSummary.error ? `₹${collectionTotal.toLocaleString()}` : "—"}</div>
            <div className="chart-total-label">{flatSummary?.error ? "Collections unavailable" : "Collected in selected period"}</div>
          </div>
        </div>

        <div className="panel events-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <span className="panel-icon mini-calendar">📅</span>
              <h2>Upcoming Events</h2>
            </div>
            <button type="button" className="text-link" onClick={() => navigate("events")}>View All →</button>
          </div>
          <div className="event-list">
            {eventsLoading ? <p className="empty-state">Loading calendar events…</p> : eventsError ? <p className="dashboard-inline-error" role="alert">{eventsError}</p> : dashboardEvents.length === 0 ? <p className="empty-state">No upcoming calendar events.</p> : dashboardEvents.map((item) => {
              const date = new Date(`${item.date}T00:00:00`);
              return <button type="button" className="event-item event-item-button" key={item.id} onClick={() => setSelectedDetails({ ...item, dateLabel: date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), timeLabel: "Not specified in calendar", locationLabel: "Not specified in calendar" })}>
                <span className="event-date">{date.toLocaleDateString(undefined, { day: "numeric" })}<span>{date.toLocaleDateString(undefined, { month: "short" })}</span></span>
                <span className="event-text"><strong>{item.title}</strong><small>{item.scope} · {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small></span>
                <span className="event-badge upcoming">Details</span>
              </button>;
            })}
          </div>
        </div>

        <div className="panel quick-panel-snap">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <span className="panel-icon mini-bolt">⚡</span>
              <h2>Quick Actions</h2>
            </div>
          </div>
          {!allSocietiesView && <div className="quick-grid">
            <button type="button" className="quick-card" onClick={() => navigate("residents", "create")}>
              <span className="quick-icon-card icon-blue">◌</span>
              <span>Add Resident</span>
            </button>
            <button type="button" className="quick-card" onClick={() => navigate("bookings", "create")}>
              <span className="quick-icon-card icon-cream">🗓</span>
              <span>Book Amenity</span>
            </button>
            <button type="button" className="quick-card" onClick={() => navigate("complaints", "create")}>
              <span className="quick-icon-card icon-pink">⚑</span>
              <span>Raise Complaint</span>
            </button>
            <button type="button" className="quick-card" onClick={() => navigate("payments", "create")}>
              <span className="quick-icon-card icon-slate">💳</span>
              <span>Make Payment</span>
            </button>
          </div>}
          <button type="button" className="view-all-btn" onClick={() => navigate("services")}>View All Services →</button>
        </div>
      </section>

      <section className="bottom-grid-snap">
        <div className="panel activity-panel-snap">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <span className="panel-icon mini-activity">⏱</span>
              <h2>Recent Activities</h2>
            </div>
            <button type="button" className="text-link" onClick={() => navigate("visitors")}>View All →</button>
          </div>
          {visitorsLoading ? <p className="empty-state">Loading recent activity…</p> : visitorsError ? <p className="dashboard-inline-error" role="alert">{visitorsError}</p> : recentVisitors.length === 0 ? <p className="empty-state">No recent visitor activity.</p>           : recentVisitors.map((visitor) => <button type="button" className="activity-item activity-button" key={`${visitor.societyId || ""}-${visitor.id}`} onClick={() => setSelectedDetails({ title: `Visitor: ${visitor.name}`, description: visitor.purpose, dateLabel: visitor.expectedAt ? new Date(visitor.expectedAt).toLocaleString() : "Not provided", timeLabel: visitor.status || "Status unavailable", locationLabel: `${visitor.societyName ? `${visitor.societyName} · ` : ""}${visitor.block} · ${visitor.flat}`, source: "visitor" })}>
            <span className="activity-check">✓</span>
            <span className="activity-copy"><strong>{visitor.name} · {visitor.status}</strong><small>{visitor.purpose} · {visitor.block} {visitor.flat}{visitor.societyName ? ` · ${visitor.societyName}` : ""}</small></span>
            <span className="activity-time">{visitor.expectedAt ? new Date(visitor.expectedAt).toLocaleDateString() : ""}</span>
          </button>)}
        </div>

        <div className="panel lock-panel-snap">
          <div className="panel-header lock-header">
            <div className="panel-title-wrap">
              <span className="panel-icon mini-lock">🔒</span>
              <h2>Smart Lock Status</h2>
            </div>
            <button type="button" className="status-button" onClick={() => navigate("smart-locks")}>View lock monitor →</button>
          </div>
          <div className="lock-visual" aria-hidden="true">
            <div className="door-image"></div>
          </div>
        </div>
      </section>
      {selectedDetails && <div className="details-backdrop" role="presentation" onClick={() => setSelectedDetails(null)}>
        <section className="details-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-detail-title" onClick={(event) => event.stopPropagation()}>
          <button className="details-close" type="button" aria-label="Close details" onClick={() => setSelectedDetails(null)}>×</button>
          <p className="eyebrow">{selectedDetails.source === "visitor" ? "VISITOR ACTIVITY" : "COMMUNITY CALENDAR"}</p>
          <h2 id="dashboard-detail-title">{selectedDetails.title}</h2>
          <dl>
            <div><dt>Date</dt><dd>{selectedDetails.dateLabel}</dd></div>
            <div><dt>Time / status</dt><dd>{selectedDetails.timeLabel}</dd></div>
            <div><dt>Location</dt><dd>{selectedDetails.locationLabel}</dd></div>
          </dl>
          <p>{selectedDetails.description || "No additional details were provided."}</p>
          <button className="secondary-button" type="button" onClick={() => { const destination = selectedDetails.source === "visitor" ? "visitors" : "events"; setSelectedDetails(null); navigate(destination); }}>Open {selectedDetails.source === "visitor" ? "visitor log" : "calendar"} →</button>
        </section>
      </div>}
    </div>
  );
}

/* =========================================================
   RESIDENT PAGE
   ========================================================= */

function ResidentPage({
  role,
  permissions,
  residents,
  search,
  setSearch,
  residentList,
  setResidentList,
  loading,
  error,
  openForm,
}) {

  const allSocietiesView = typeof window !== "undefined" && window.localStorage.getItem("nestora-admin-society-id") === "all";
  const canAdd = !allSocietiesView && role === "manager" && permissions?.residents?.add === true;
  const [showForm, setShowForm] = useState(() => Boolean(openForm && canAdd));
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [flatChoices, setFlatChoices] = useState([]);
  const [selectedFlatId, setSelectedFlatId] = useState("");
  const [flatChoicesLoading, setFlatChoicesLoading] = useState(false);
  const [flatChoicesError, setFlatChoicesError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    flat: "",
    block: "Block A",
  });

  useEffect(() => {
    if (!['admin', 'manager'].includes(role)) {
      return undefined;
    }
    let current = true;
    apiFetch("/api/flats")
      .then(readApiJson)
      .then((flats) => {
        if (current) {
          setFlatChoices(flats);
          setFlatChoicesError("");
        }
      })
      .catch((requestError) => {
        if (current) setFlatChoicesError(requestError.message || "Could not load flat choices.");
      })
      .finally(() => {
        if (current) setFlatChoicesLoading(false);
      });
    return () => { current = false; };
  }, [role]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.name || !form.email || !form.phone || !form.flat) {
      setSubmitError("Please fill in name, email, phone, and flat.");
      return;
    }

    setSaving(true);
    setSubmitError("");

    try {
      const response = await apiFetch("/api/residents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const newResident = await readApiJson(response);

      if (!response.ok) {
        throw new Error(newResident.message || "Could not save resident.");
      }

      setResidentList([...residentList, newResident]);
      setFlatChoices((current) => current.map((flat) => String(flat.id) === selectedFlatId
        ? { ...flat, residentCount: Number(flat.residentCount || 0) + 1, status: "Occupied" }
        : flat));
      setSelectedFlatId("");
      setForm({
        name: "",
        email: "",
        phone: "",
        flat: "",
        block: "Block A",
      });
      setShowForm(false);
    } catch (requestError) {
      setSubmitError(requestError.message || "Could not save resident.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="welcome-row">

        <div>

          <p className="eyebrow">{role === "resident" ? "YOUR COMMUNITY ACCOUNT" : "COMMUNITY DIRECTORY"}</p>

          <h1>
            {role === "resident" ? "My profile" : "Resident management"}
          </h1>

          <p className="welcome-subtitle">
            {role === "resident" ? "View your resident and flat information." : role === "admin" ? "Read-only resident records across your community." : "Add and manage residential community members."}
          </p>

        </div>

        {canAdd && <button
          className="primary-button"
          onClick={() => setShowForm(!showForm)}
        >
          + Add resident
        </button>}

      </section>

      {showForm && canAdd && (

        <form
          className="panel resident-form"
          onSubmit={handleSubmit}
        >

          <div className="panel-heading">

            <div>
              <h2>Add New Resident</h2>
              <p>
                Choose a flat from MySQL; each option shows its current occupancy.
              </p>
            </div>

            <button
              type="button"
              className="close-form"
              onClick={() => setShowForm(false)}
            >
              ×
            </button>

          </div>

          <div className="form-grid">

            <label>
              Full Name *
              <input
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                placeholder="Enter full name"
              />
            </label>

            <label>
              Email *
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value,
                  })
                }
                placeholder="resident@example.com"
              />
            </label>

            <label>
              Phone *
              <input
                required
                value={form.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    phone: e.target.value,
                  })
                }
                placeholder="9876543210"
              />
            </label>

            <label>
              Flat and occupancy *
              <select
                required
                value={selectedFlatId}
                disabled={flatChoicesLoading || flatChoices.length === 0}
                onChange={(event) => {
                  const chosenFlat = flatChoices.find((flat) => String(flat.id) === event.target.value);
                  setSelectedFlatId(event.target.value);
                  if (chosenFlat) setForm({ ...form, flat: chosenFlat.flat, block: chosenFlat.block });
                }}
              >
                <option value="">{flatChoicesLoading ? "Loading flats…" : "Choose a flat"}</option>
                {flatChoices.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.block} · {flat.flat} · {flat.status} ({Number(flat.residentCount) || 0} residents)
                  </option>
                ))}
              </select>
            </label>

          </div>

          {flatChoicesError && <p className="flat-error" role="alert">{flatChoicesError}</p>}

          <button
            className="primary-button"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Resident"}
          </button>

        </form>
      )}

      {submitError && <p role="alert">{submitError}</p>}

      {error && <p role="alert">{error}</p>}

      <section className="panel residents-panel">

        <div className="panel-heading">

          <div>
            <h2>{role === "resident" ? "Your profile details" : "All residents"}</h2>

            <p>
              {role === "resident" ? "Your information from the community database" : `${residentList.length} resident records`}
            </p>
          </div>

          {role !== "resident" && <div className="search-box table-search">

            <span>⌕</span>

            <input
              placeholder="Search residents..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

          </div>}

        </div>

        <div className="table-wrapper">

          <table>

            <thead>

              <tr>
                {allSocietiesView && <th>Society</th>}
                <th>Resident</th>
                <th>Phone</th>
                <th>Flat</th>
                <th>Block</th>
                <th>Type</th>
              </tr>

            </thead>

            <tbody>

              {loading ? (
                <tr><td colSpan={allSocietiesView ? 6 : 5}>Loading residents...</td></tr>
              ) : error ? (
                <tr><td colSpan={allSocietiesView ? 6 : 5}>Could not load residents from MySQL.</td></tr>
              ) : residents.length === 0 ? (
                <tr><td colSpan={allSocietiesView ? 6 : 5}>No residents found.</td></tr>
              ) : residents.map((resident) => (

                <tr key={`${resident.societyId || ""}-${resident.id}`}>
                  {allSocietiesView && <td>{resident.societyName}</td>}

                  <td>

                    <div className="resident-cell">

                      <div className="resident-avatar">
                        {resident.name
                          .split(" ")
                          .map((word) => word[0])
                          .join("")}
                      </div>

                      <div>
                        <strong>
                          {resident.name}
                        </strong>

                        <span>
                          {resident.email}
                        </span>
                      </div>

                    </div>

                  </td>

                  <td>{resident.phone}</td>

                  <td>{resident.flat}</td>

                  <td>{resident.block}</td>

                  <td>

                    <span className="status-pill">
                      <i />
                      {resident.status}
                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

        {!loading && !error && residents.length === 0 && (
          <p className="empty-state">
            No residents found.
          </p>
        )}

      </section>
    </>
  );
}

/* =========================================================
   FLATS PAGE
   ========================================================= */

/* =========================================================
   SETTINGS
   ========================================================= */

function SettingsPage({ currentUser }) {

  const [notifications, setNotifications] = useState(true);
  const [autoPayment, setAutoPayment] = useState(false);

  return (
    <>
      <section className="welcome-row">

        <div>

          <p className="eyebrow">
            SYSTEM CONFIGURATION
          </p>

          <h1>
            Settings
          </h1>

          <p className="welcome-subtitle">
            Configure your society management system.
          </p>

        </div>

      </section>

      <div className="settings-grid">

        <section className="settings-card">

          <div className="settings-icon">
            ⚙
          </div>

          <h2>Society Information</h2>

          <p>
            Basic information about your residential society.
          </p>

          <p className="settings-notice" role="status">Society settings are not connected to the database yet. Changes on this screen are not saved.</p>

          <div className="settings-fields">

            <label>
              Society Name
              <input placeholder="Enter your society name" />
            </label>

            <label>
              Address
              <input placeholder="Enter your society address" />
            </label>

            <label>
              Contact Number
              <input placeholder="Enter a contact number" />
            </label>

            <label>
              Email
              <input placeholder="Enter a contact email" />
            </label>

          </div>

          <button
            className="primary-button"
            onClick={() =>
              alert("Society settings are not connected yet. No changes were saved.")
            }
          >
            Save Changes
          </button>

        </section>

        <section className="settings-card">

          <div className="settings-icon purple">
            🔔
          </div>

          <h2>Notifications</h2>

          <p>
            Notification preferences are a preview and are not saved yet.
          </p>

          <SettingToggle
            title="Resident Notifications"
            description="Notify residents about society updates."
            value={notifications}
            setValue={setNotifications}
          />

          <SettingToggle
            title="Automatic Payment Reminders"
            description="Send reminders for pending maintenance."
            value={autoPayment}
            setValue={setAutoPayment}
          />

        </section>

        <section className="settings-card">

          <div className="settings-icon orange">
            🔐
          </div>

          <h2>Administrator Account</h2>

          <p>
            Manage your administrator account.
          </p>

          <div className="settings-fields">

            <label>
              Administrator Name
              <input value={currentUser.name} readOnly />
            </label>

            <label>
              Email
              <input value={currentUser.email} readOnly />
            </label>

            <label>
              Role
              <input
                value="Administrator"
                disabled
              />
            </label>

          </div>

          <button
            className="primary-button"
            onClick={() =>
              alert("Account profile editing is not connected yet. No changes were saved.")
            }
          >
            Update Profile
          </button>

        </section>

      </div>
    </>
  );
}

/* =========================================================
   SMALL COMPONENTS
   ========================================================= */

function MiniStat({ title, value, icon }) {

  return (
    <div className="stat-card">

      <div className="stat-top">

        <div className="stat-icon blue">
          {icon}
        </div>

      </div>

      <p>{title}</p>

      <h2>{value}</h2>

    </div>
  );
}

function SettingToggle({
  title,
  description,
  value,
  setValue,
}) {

  return (
    <div className="setting-toggle">

      <div>

        <strong>
          {title}
        </strong>

        <span>
          {description}
        </span>

      </div>

      <button
        className={`toggle ${value ? "on" : ""}`}
        onClick={() => setValue(!value)}
      >
        <span />
      </button>

    </div>
  );
}

void MiniStat;

export default App;
