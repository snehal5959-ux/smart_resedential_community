import { useState } from "react";
import "./App.css";

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
  { id: "complaints", icon: "!", label: "Complaints", badge: "8" },
  { id: "vehicles", icon: "▱", label: "Vehicles" },
  { id: "notices", icon: "▤", label: "Notices" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

/* =========================================================
   RESIDENT DATA
   ========================================================= */

const initialResidents = [
  {
    id: 1,
    name: "Rahul Kumar",
    email: "rahul@example.com",
    phone: "9876543210",
    flat: "A-101",
    block: "Block A",
    status: "Active",
  },
  {
    id: 2,
    name: "Priya Sharma",
    email: "priya@example.com",
    phone: "9876543211",
    flat: "A-102",
    block: "Block A",
    status: "Active",
  },
  {
    id: 3,
    name: "Amit Patel",
    email: "amit@example.com",
    phone: "9876543212",
    flat: "B-201",
    block: "Block B",
    status: "Active",
  },
  {
    id: 4,
    name: "Sneha Joshi",
    email: "sneha@example.com",
    phone: "9876543213",
    flat: "C-301",
    block: "Block C",
    status: "Active",
  },
  {
    id: 5,
    name: "Neha Kulkarni",
    email: "neha@example.com",
    phone: "9876543214",
    flat: "B-202",
    block: "Block B",
    status: "Active",
  },
  {
    id: 6,
    name: "Rohan Deshmukh",
    email: "rohan@example.com",
    phone: "9876543215",
    flat: "C-302",
    block: "Block C",
    status: "Inactive",
  },
];

/* =========================================================
   FLATS
   ========================================================= */

const flats = [
  {
    flat: "A-101",
    block: "Block A",
    floor: "1",
    type: "2 BHK",
    resident: "Rahul Kumar",
    status: "Occupied",
  },
  {
    flat: "A-102",
    block: "Block A",
    floor: "1",
    type: "2 BHK",
    resident: "Priya Sharma",
    status: "Occupied",
  },
  {
    flat: "A-201",
    block: "Block A",
    floor: "2",
    type: "3 BHK",
    resident: "—",
    status: "Vacant",
  },
  {
    flat: "B-201",
    block: "Block B",
    floor: "2",
    type: "2 BHK",
    resident: "Amit Patel",
    status: "Occupied",
  },
  {
    flat: "B-202",
    block: "Block B",
    floor: "2",
    type: "2 BHK",
    resident: "Neha Kulkarni",
    status: "Occupied",
  },
  {
    flat: "C-301",
    block: "Block C",
    floor: "3",
    type: "3 BHK",
    resident: "Sneha Joshi",
    status: "Occupied",
  },
  {
    flat: "C-302",
    block: "Block C",
    floor: "3",
    type: "2 BHK",
    resident: "Rohan Deshmukh",
    status: "Occupied",
  },
  {
    flat: "C-401",
    block: "Block C",
    floor: "4",
    type: "3 BHK",
    resident: "—",
    status: "Vacant",
  },
];

/* =========================================================
   AMENITIES
   ========================================================= */

const amenities = [
  {
    name: "Swimming Pool",
    location: "Block A Ground Floor",
    timing: "6:00 AM - 9:00 PM",
    capacity: "30 people",
    status: "Available",
  },
  {
    name: "Community Hall",
    location: "Block B Ground Floor",
    timing: "9:00 AM - 10:00 PM",
    capacity: "100 people",
    status: "Available",
  },
  {
    name: "Gym",
    location: "Block C Ground Floor",
    timing: "5:00 AM - 11:00 PM",
    capacity: "25 people",
    status: "Available",
  },
  {
    name: "Children Play Area",
    location: "Central Garden",
    timing: "6:00 AM - 9:00 PM",
    capacity: "40 children",
    status: "Available",
  },
];

/* =========================================================
   BOOKINGS
   ========================================================= */

const bookings = [
  {
    resident: "Rahul Kumar",
    amenity: "Community Hall",
    date: "20 Sep 2026",
    time: "5:00 PM - 9:00 PM",
    status: "Confirmed",
  },
  {
    resident: "Priya Sharma",
    amenity: "Swimming Pool",
    date: "21 Sep 2026",
    time: "7:00 AM - 8:00 AM",
    status: "Confirmed",
  },
  {
    resident: "Amit Patel",
    amenity: "Gym",
    date: "22 Sep 2026",
    time: "6:00 PM - 7:00 PM",
    status: "Pending",
  },
  {
    resident: "Sneha Joshi",
    amenity: "Community Hall",
    date: "25 Sep 2026",
    time: "4:00 PM - 8:00 PM",
    status: "Confirmed",
  },
];

/* =========================================================
   MAINTENANCE
   ========================================================= */

const maintenance = [
  {
    flat: "A-101",
    resident: "Rahul Kumar",
    amount: "₹2,500",
    month: "September 2026",
    status: "Paid",
  },
  {
    flat: "A-102",
    resident: "Priya Sharma",
    amount: "₹2,500",
    month: "September 2026",
    status: "Paid",
  },
  {
    flat: "B-201",
    resident: "Amit Patel",
    amount: "₹2,500",
    month: "September 2026",
    status: "Pending",
  },
  {
    flat: "B-202",
    resident: "Neha Kulkarni",
    amount: "₹2,500",
    month: "September 2026",
    status: "Paid",
  },
  {
    flat: "C-301",
    resident: "Sneha Joshi",
    amount: "₹2,500",
    month: "September 2026",
    status: "Pending",
  },
];

/* =========================================================
   PAYMENTS
   ========================================================= */

const payments = [
  {
    receipt: "PAY-1001",
    resident: "Rahul Kumar",
    flat: "A-101",
    amount: "₹2,500",
    date: "05 Sep 2026",
    method: "UPI",
    status: "Successful",
  },
  {
    receipt: "PAY-1002",
    resident: "Priya Sharma",
    flat: "A-102",
    amount: "₹2,500",
    date: "05 Sep 2026",
    method: "Card",
    status: "Successful",
  },
  {
    receipt: "PAY-1003",
    resident: "Neha Kulkarni",
    flat: "B-202",
    amount: "₹2,500",
    date: "07 Sep 2026",
    method: "UPI",
    status: "Successful",
  },
  {
    receipt: "PAY-1004",
    resident: "Amit Patel",
    flat: "B-201",
    amount: "₹2,500",
    date: "—",
    method: "—",
    status: "Pending",
  },
];

/* =========================================================
   COMPLAINTS
   ========================================================= */

const complaints = [
  {
    id: "CMP-101",
    resident: "Rahul Kumar",
    subject: "Water leakage",
    category: "Plumbing",
    date: "17 Sep 2026",
    priority: "High",
    status: "Open",
  },
  {
    id: "CMP-102",
    resident: "Priya Sharma",
    subject: "Lift not working",
    category: "Lift",
    date: "16 Sep 2026",
    priority: "High",
    status: "In Progress",
  },
  {
    id: "CMP-103",
    resident: "Amit Patel",
    subject: "Street light issue",
    category: "Electrical",
    date: "15 Sep 2026",
    priority: "Medium",
    status: "Open",
  },
  {
    id: "CMP-104",
    resident: "Sneha Joshi",
    subject: "Garden cleaning",
    category: "Cleaning",
    date: "14 Sep 2026",
    priority: "Low",
    status: "Resolved",
  },
];

/* =========================================================
   VEHICLES
   ========================================================= */

const vehicles = [
  {
    number: "MH-12-AB-1234",
    resident: "Rahul Kumar",
    flat: "A-101",
    type: "Car",
    parking: "P-021",
    status: "Active",
  },
  {
    number: "MH-12-CD-5678",
    resident: "Priya Sharma",
    flat: "A-102",
    type: "Scooter",
    parking: "P-045",
    status: "Active",
  },
  {
    number: "MH-12-EF-9012",
    resident: "Amit Patel",
    flat: "B-201",
    type: "Car",
    parking: "P-056",
    status: "Active",
  },
  {
    number: "MH-12-GH-3456",
    resident: "Sneha Joshi",
    flat: "C-301",
    type: "Scooter",
    parking: "P-077",
    status: "Active",
  },
];

/* =========================================================
   NOTICES
   ========================================================= */

const notices = [
  {
    title: "Society Maintenance Due",
    description: "September maintenance payment is due by 25 September.",
    date: "18 Sep 2026",
    audience: "All Residents",
    status: "Published",
  },
  {
    title: "Ganesh Chaturthi Celebration",
    description: "Community celebration will be held in the community hall.",
    date: "17 Sep 2026",
    audience: "All Residents",
    status: "Published",
  },
  {
    title: "Water Tank Cleaning",
    description: "Water supply may be interrupted between 10 AM and 2 PM.",
    date: "16 Sep 2026",
    audience: "Block A & B",
    status: "Published",
  },
  {
    title: "Parking Inspection",
    description: "Parking slots will be inspected this weekend.",
    date: "15 Sep 2026",
    audience: "Vehicle Owners",
    status: "Draft",
  },
];

/* =========================================================
   APP
   ========================================================= */

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [residentList, setResidentList] = useState(initialResidents);

  const activeLabel =
    menuItems.find((item) => item.id === activePage)?.label || "Dashboard";

  function navigate(page) {
    setActivePage(page);
    setSidebarOpen(false);
    setSearch("");
  }

  const filteredResidents = residentList.filter((resident) =>
    `${resident.name} ${resident.email} ${resident.flat} ${resident.phone}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="app-shell">

      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>

        <div className="brand">
          <div className="brand-mark">N</div>

          <div>
            <h2>Nestora</h2>
            <span>Community Management</span>
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
            <strong>Green Valley</strong>
            <span>Residential Society</span>
          </div>

          <span className="society-dot">●</span>
        </div>

        <nav className="navigation">
          <p className="nav-heading">MAIN MENU</p>

          {menuItems.map((item) => (
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

            <div className="avatar">AS</div>

            <div>
              <strong>Admin</strong>
              <span>Society Manager</span>
            </div>

            <button
              onClick={() => setShowProfile(!showProfile)}
            >
              ⋮
            </button>

            {showProfile && (
              <div className="profile-popup">
                <strong>Admin Account</strong>
                <p>admin@greenvalley.com</p>

                <button
                  onClick={() => {
                    setShowProfile(false);
                    navigate("settings");
                  }}
                >
                  Account Settings
                </button>
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

      <main className="main-content">

        <header className="topbar">

          <button
            className="menu-toggle"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <b>/</b>
            <strong>{activeLabel}</strong>
          </div>

          <div className="topbar-actions">

            <div className="search-box">
              <span>⌕</span>

              <input
                placeholder="Search residents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              className="icon-button"
              onClick={() =>
                alert("You have 3 new notifications.")
              }
            >
              ♧
              <span className="notification-dot" />
            </button>

            <div className="top-avatar">AS</div>

          </div>
        </header>

        <div className="page-content">

          {/* =================================================
              DASHBOARD
              ================================================= */}

          {activePage === "dashboard" && (
            <Dashboard navigate={navigate} />
          )}

          {/* =================================================
              RESIDENTS
              ================================================= */}

          {activePage === "residents" && (
            <ResidentPage
              residents={filteredResidents}
              search={search}
              setSearch={setSearch}
              residentList={residentList}
              setResidentList={setResidentList}
            />
          )}

          {/* =================================================
              FLATS
              ================================================= */}

          {activePage === "flats" && (
            <FlatsPage navigate={navigate} />
          )}

          {/* =================================================
              AMENITIES
              ================================================= */}

          {activePage === "amenities" && (
            <ManagementPage
              title="Amenities"
              eyebrow="COMMUNITY FACILITIES"
              description="Manage society facilities and availability."
              icon="✦"
              data={amenities}
              columns={[
                ["name", "Amenity"],
                ["location", "Location"],
                ["timing", "Timing"],
                ["capacity", "Capacity"],
                ["status", "Status"],
              ]}
              addText="Add Amenity"
            />
          )}

          {/* =================================================
              BOOKINGS
              ================================================= */}

          {activePage === "bookings" && (
            <ManagementPage
              title="Amenity Bookings"
              eyebrow="BOOKING MANAGEMENT"
              description="Track community hall, gym and facility bookings."
              icon="◷"
              data={bookings}
              columns={[
                ["resident", "Resident"],
                ["amenity", "Amenity"],
                ["date", "Date"],
                ["time", "Time"],
                ["status", "Status"],
              ]}
              addText="New Booking"
            />
          )}

          {/* =================================================
              MAINTENANCE
              ================================================= */}

          {activePage === "maintenance" && (
            <ManagementPage
              title="Maintenance"
              eyebrow="MAINTENANCE MANAGEMENT"
              description="Manage monthly society maintenance charges."
              icon="⌁"
              data={maintenance}
              columns={[
                ["flat", "Flat"],
                ["resident", "Resident"],
                ["amount", "Amount"],
                ["month", "Month"],
                ["status", "Status"],
              ]}
              addText="Create Charge"
            />
          )}

          {/* =================================================
              PAYMENTS
              ================================================= */}

          {activePage === "payments" && (
            <ManagementPage
              title="Payments"
              eyebrow="PAYMENT MANAGEMENT"
              description="Track maintenance payments and receipts."
              icon="₹"
              data={payments}
              columns={[
                ["receipt", "Receipt"],
                ["resident", "Resident"],
                ["flat", "Flat"],
                ["amount", "Amount"],
                ["date", "Date"],
                ["method", "Method"],
                ["status", "Status"],
              ]}
              addText="Record Payment"
            />
          )}

          {/* =================================================
              COMPLAINTS
              ================================================= */}

          {activePage === "complaints" && (
            <ManagementPage
              title="Complaints"
              eyebrow="SERVICE DESK"
              description="Review and resolve resident complaints."
              icon="!"
              data={complaints}
              columns={[
                ["id", "Complaint ID"],
                ["resident", "Resident"],
                ["subject", "Subject"],
                ["category", "Category"],
                ["date", "Date"],
                ["priority", "Priority"],
                ["status", "Status"],
              ]}
              addText="New Complaint"
            />
          )}

          {/* =================================================
              VEHICLES
              ================================================= */}

          {activePage === "vehicles" && (
            <ManagementPage
              title="Vehicles"
              eyebrow="PARKING MANAGEMENT"
              description="Manage registered vehicles and parking slots."
              icon="▱"
              data={vehicles}
              columns={[
                ["number", "Vehicle Number"],
                ["resident", "Resident"],
                ["flat", "Flat"],
                ["type", "Type"],
                ["parking", "Parking"],
                ["status", "Status"],
              ]}
              addText="Register Vehicle"
            />
          )}

          {/* =================================================
              NOTICES
              ================================================= */}

          {activePage === "notices" && (
            <ManagementPage
              title="Notices"
              eyebrow="COMMUNITY COMMUNICATION"
              description="Publish important announcements for residents."
              icon="▤"
              data={notices}
              columns={[
                ["title", "Notice"],
                ["description", "Description"],
                ["date", "Date"],
                ["audience", "Audience"],
                ["status", "Status"],
              ]}
              addText="Create Notice"
            />
          )}

          {/* =================================================
              SETTINGS
              ================================================= */}

          {activePage === "settings" && (
            <SettingsPage />
          )}

        </div>
      </main>
    </div>
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function Dashboard({ navigate }) {

  const stats = [
    {
      label: "Total Residents",
      value: "248",
      change: "+12 this month",
      icon: "♙",
      color: "blue",
    },
    {
      label: "Total Flats",
      value: "120",
      change: "3 residential blocks",
      icon: "▦",
      color: "purple",
    },
    {
      label: "Pending Dues",
      value: "₹24,500",
      change: "9 flats pending",
      icon: "₹",
      color: "orange",
    },
    {
      label: "Open Complaints",
      value: "08",
      change: "3 high priority",
      icon: "!",
      color: "green",
    },
  ];

  return (
    <>
      {/* VIDEO HERO */}

      <section className="dashboard-video">

        <video
          className="dashboard-video-bg"
          src="/vc.mp4"
          autoPlay
          muted
          loop
          playsInline
        />

        <div className="dashboard-video-overlay" />

        <div className="dashboard-video-content">

          <p className="video-eyebrow">
            SMART RESIDENTIAL COMMUNITY
          </p>

          <h1>
            Welcome back, Admin
            <span> ✦</span>
          </h1>

          <p>
            Manage your residents, flats, amenities,
            payments and community activities from one place.
          </p>

          <div className="video-buttons">

            <button
              className="video-primary"
              onClick={() => navigate("residents")}
            >
              Manage Residents →
            </button>

            <button
              className="video-secondary"
              onClick={() => navigate("flats")}
            >
              View Flats
            </button>

          </div>

        </div>

        <div className="video-live">
          <span />
          LIVE COMMUNITY
        </div>

      </section>

      {/* WELCOME */}

      <section className="welcome-row">

        <div>
          <p className="eyebrow">
            COMMUNITY OVERVIEW
          </p>

          <h1>
            Green Valley Society
          </h1>

          <p className="welcome-subtitle">
            Here's what's happening in your community today.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => navigate("residents")}
        >
          <span>+</span>
          Add Resident
        </button>

      </section>

      {/* STATS */}

      <section className="stats-grid">

        {stats.map((stat) => (
          <div
            className="stat-card"
            key={stat.label}
          >

            <div className="stat-top">

              <div className={`stat-icon ${stat.color}`}>
                {stat.icon}
              </div>

              <span className="stat-menu">
                •••
              </span>

            </div>

            <p>{stat.label}</p>

            <h2>{stat.value}</h2>

            <span className={`stat-change ${stat.color}`}>
              {stat.change}
            </span>

          </div>
        ))}

      </section>

      {/* DASHBOARD GRID */}

      <section className="dashboard-grid">

        {/* COLLECTION */}

        <div className="panel activity-panel">

          <div className="panel-heading">

            <div>
              <h2>Maintenance Collection</h2>
              <p>
                Monthly society collection overview
              </p>
            </div>

            <select defaultValue="September">
              <option>September</option>
              <option>August</option>
              <option>July</option>
            </select>

          </div>

          <div className="overview-total">

            <div>
              <p>Total Collected</p>
              <h3>₹2,48,000</h3>
            </div>

            <span className="positive">
              ↗ 12.5%
            </span>

          </div>

          <div className="collection-bars">

            <div style={{ height: "55%" }}>
              <span>Apr</span>
            </div>

            <div style={{ height: "70%" }}>
              <span>May</span>
            </div>

            <div style={{ height: "62%" }}>
              <span>Jun</span>
            </div>

            <div style={{ height: "80%" }}>
              <span>Jul</span>
            </div>

            <div style={{ height: "74%" }}>
              <span>Aug</span>
            </div>

            <div style={{ height: "92%" }}>
              <span>Sep</span>
            </div>

          </div>

        </div>

        {/* QUICK ACTIONS */}

        <div className="panel quick-panel">

          <div className="panel-heading">

            <div>
              <h2>Quick Actions</h2>
              <p>Frequently used features</p>
            </div>

          </div>

          <div className="quick-actions">

            <button onClick={() => navigate("flats")}>

              <span className="quick-icon blue">
                ▦
              </span>

              <span>
                <strong>Manage Flats</strong>
                <small>
                  View blocks and occupancy
                </small>
              </span>

              <b>→</b>

            </button>

            <button onClick={() => navigate("bookings")}>

              <span className="quick-icon purple">
                ◷
              </span>

              <span>
                <strong>View Bookings</strong>
                <small>
                  Check facility bookings
                </small>
              </span>

              <b>→</b>

            </button>

            <button onClick={() => navigate("payments")}>

              <span className="quick-icon orange">
                ₹
              </span>

              <span>
                <strong>View Payments</strong>
                <small>
                  Check maintenance dues
                </small>
              </span>

              <b>→</b>

            </button>

            <button onClick={() => navigate("complaints")}>

              <span className="quick-icon green">
                !
              </span>

              <span>
                <strong>Manage Complaints</strong>
                <small>
                  Review open complaints
                </small>
              </span>

              <b>→</b>

            </button>

          </div>

        </div>

      </section>

      {/* RECENT RESIDENTS */}

      <section className="panel residents-panel">

        <div className="panel-heading">

          <div>
            <h2>Recent Residents</h2>
            <p>
              Latest registered community members
            </p>
          </div>

          <button
            className="text-button"
            onClick={() => navigate("residents")}
          >
            View All Residents →
          </button>

        </div>

        <div className="table-wrapper">

          <table>

            <thead>
              <tr>
                <th>Resident</th>
                <th>Flat</th>
                <th>Block</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>

              {initialResidents.slice(0, 5).map((resident) => (

                <tr key={resident.id}>

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

      </section>

      {/* MODULE CARDS */}

      <section className="modules-section">

        <div className="section-heading">

          <div>
            <p className="eyebrow">
              ALL FEATURES
            </p>

            <h2>
              Community Management
            </h2>
          </div>

          <span>
            10 modules
          </span>

        </div>

        <div className="modules-grid">

          {[
            ["♙", "Residents", "Manage community members.", "residents"],
            ["▦", "Flats & Blocks", "Manage flat occupancy.", "flats"],
            ["✦", "Amenities", "Manage society facilities.", "amenities"],
            ["◷", "Bookings", "Manage facility bookings.", "bookings"],
            ["⌁", "Maintenance", "Manage monthly charges.", "maintenance"],
            ["₹", "Payments", "Track payments and dues.", "payments"],
            ["!", "Complaints", "Resolve resident complaints.", "complaints"],
            ["▱", "Vehicles", "Manage parking vehicles.", "vehicles"],
            ["▤", "Notices", "Publish society notices.", "notices"],
            ["⚙", "Settings", "Configure society settings.", "settings"],
          ].map(([icon, title, text, page], index) => (

            <button
              className="module-card"
              key={title}
              onClick={() => navigate(page)}
            >

              <div
                className={`module-icon ${
                  ["blue", "purple", "orange", "green"][index % 4]
                }`}
              >
                {icon}
              </div>

              <div>

                <h3>{title}</h3>

                <p>{text}</p>

              </div>

              <span className="module-arrow">
                ↗
              </span>

            </button>

          ))}

        </div>

      </section>
    </>
  );
}

/* =========================================================
   RESIDENT PAGE
   ========================================================= */

function ResidentPage({
  residents,
  search,
  setSearch,
  residentList,
  setResidentList,
}) {

  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    flat: "",
    block: "Block A",
  });

  function handleSubmit(e) {

    e.preventDefault();

    if (!form.name || !form.email || !form.flat) {
      alert("Please fill all required fields.");
      return;
    }

    const newResident = {
      id: Date.now(),
      ...form,
      status: "Active",
    };

    setResidentList([
      ...residentList,
      newResident,
    ]);

    setForm({
      name: "",
      email: "",
      phone: "",
      flat: "",
      block: "Block A",
    });

    setShowForm(false);

    alert("Resident added successfully!");
  }

  return (
    <>
      <section className="welcome-row">

        <div>

          <p className="eyebrow">
            COMMUNITY DIRECTORY
          </p>

          <h1>
            Resident Management
          </h1>

          <p className="welcome-subtitle">
            Add and manage residential community members.
          </p>

        </div>

        <button
          className="primary-button"
          onClick={() => setShowForm(!showForm)}
        >
          + Add Resident
        </button>

      </section>

      {showForm && (

        <form
          className="panel resident-form"
          onSubmit={handleSubmit}
        >

          <div className="panel-heading">

            <div>
              <h2>Add New Resident</h2>
              <p>
                Enter resident information.
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
              Phone
              <input
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
              Flat Number *
              <input
                value={form.flat}
                onChange={(e) =>
                  setForm({
                    ...form,
                    flat: e.target.value,
                  })
                }
                placeholder="A-101"
              />
            </label>

            <label>
              Block
              <select
                value={form.block}
                onChange={(e) =>
                  setForm({
                    ...form,
                    block: e.target.value,
                  })
                }
              >
                <option>Block A</option>
                <option>Block B</option>
                <option>Block C</option>
              </select>
            </label>

          </div>

          <button
            className="primary-button"
            type="submit"
          >
            Save Resident
          </button>

        </form>
      )}

      <section className="panel residents-panel">

        <div className="panel-heading">

          <div>
            <h2>All Residents</h2>

            <p>
              {residentList.length} resident records
            </p>
          </div>

          <div className="search-box table-search">

            <span>⌕</span>

            <input
              placeholder="Search residents..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

          </div>

        </div>

        <div className="table-wrapper">

          <table>

            <thead>

              <tr>
                <th>Resident</th>
                <th>Phone</th>
                <th>Flat</th>
                <th>Block</th>
                <th>Status</th>
              </tr>

            </thead>

            <tbody>

              {residents.map((resident) => (

                <tr key={resident.id}>

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

        {residents.length === 0 && (
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

function FlatsPage() {

  return (
    <>
      <section className="welcome-row">

        <div>

          <p className="eyebrow">
            PROPERTY MANAGEMENT
          </p>

          <h1>
            Flats & Blocks
          </h1>

          <p className="welcome-subtitle">
            Manage flats, blocks and resident occupancy.
          </p>

        </div>

        <button
          className="primary-button"
          onClick={() =>
            alert("Add Flat form can be connected next.")
          }
        >
          + Add Flat
        </button>

      </section>

      <section className="stats-grid">

        <MiniStat
          title="Total Flats"
          value="120"
          icon="▦"
        />

        <MiniStat
          title="Occupied"
          value="106"
          icon="✓"
        />

        <MiniStat
          title="Vacant"
          value="14"
          icon="○"
        />

        <MiniStat
          title="Blocks"
          value="3"
          icon="⌂"
        />

      </section>

      <section className="panel residents-panel">

        <div className="panel-heading">

          <div>
            <h2>Flat Directory</h2>
            <p>
              Current flat occupancy
            </p>
          </div>

        </div>

        <div className="table-wrapper">

          <table>

            <thead>

              <tr>
                <th>Flat</th>
                <th>Block</th>
                <th>Floor</th>
                <th>Type</th>
                <th>Resident</th>
                <th>Status</th>
              </tr>

            </thead>

            <tbody>

              {flats.map((flat) => (

                <tr key={flat.flat}>

                  <td>
                    <strong>
                      {flat.flat}
                    </strong>
                  </td>

                  <td>{flat.block}</td>

                  <td>{flat.floor}</td>

                  <td>{flat.type}</td>

                  <td>{flat.resident}</td>

                  <td>
                    <Status status={flat.status} />
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </section>
    </>
  );
}

/* =========================================================
   GENERIC MANAGEMENT PAGE
   ========================================================= */

function ManagementPage({
  title,
  eyebrow,
  description,
  icon,
  data,
  columns,
  addText,
}) {

  return (
    <>
      <section className="welcome-row">

        <div>

          <p className="eyebrow">
            {eyebrow}
          </p>

          <h1>
            {title}
          </h1>

          <p className="welcome-subtitle">
            {description}
          </p>

        </div>

        <button
          className="primary-button"
          onClick={() =>
            alert(`${addText} form will be connected to the backend.`)
          }
        >
          + {addText}
        </button>

      </section>

      <section className="management-summary">

        <div className="management-summary-icon">
          {icon}
        </div>

        <div>
          <strong>
            {data.length} records
          </strong>

          <span>
            Updated September 2026
          </span>
        </div>

        <div className="management-summary-right">
          <span className="live-dot" />
          System Active
        </div>

      </section>

      <section className="panel residents-panel">

        <div className="panel-heading">

          <div>
            <h2>
              {title} Records
            </h2>

            <p>
              Manage and monitor community information
            </p>
          </div>

          <button
            className="text-button"
            onClick={() =>
              alert("Export feature will be connected later.")
            }
          >
            Export CSV ↓
          </button>

        </div>

        <div className="table-wrapper">

          <table>

            <thead>

              <tr>

                {columns.map(([key, label]) => (
                  <th key={key}>
                    {label}
                  </th>
                ))}

              </tr>

            </thead>

            <tbody>

              {data.map((row, index) => (

                <tr key={index}>

                  {columns.map(([key]) => (

                    <td key={key}>

                      {key === "status" ||
                      key === "priority" ? (
                        <Status status={row[key]} />
                      ) : (
                        row[key]
                      )}

                    </td>

                  ))}

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </section>
    </>
  );
}

/* =========================================================
   SETTINGS
   ========================================================= */

function SettingsPage() {

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

          <div className="settings-fields">

            <label>
              Society Name
              <input defaultValue="Green Valley" />
            </label>

            <label>
              Address
              <input defaultValue="Pune, Maharashtra" />
            </label>

            <label>
              Contact Number
              <input defaultValue="+91 98765 43210" />
            </label>

            <label>
              Email
              <input defaultValue="admin@greenvalley.com" />
            </label>

          </div>

          <button
            className="primary-button"
            onClick={() =>
              alert("Society information saved.")
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
            Manage notifications and alerts.
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
              <input defaultValue="Admin" />
            </label>

            <label>
              Email
              <input defaultValue="admin@greenvalley.com" />
            </label>

            <label>
              Role
              <input
                defaultValue="Society Manager"
                disabled
              />
            </label>

          </div>

          <button
            className="primary-button"
            onClick={() =>
              alert("Profile updated.")
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

function Status({ status }) {

  let className = "status-pill";

  if (
    status === "Pending" ||
    status === "Open" ||
    status === "High"
  ) {
    className = "status-pill status-warning";
  }

  if (
    status === "In Progress" ||
    status === "Medium"
  ) {
    className = "status-pill status-progress";
  }

  if (
    status === "Vacant" ||
    status === "Low"
  ) {
    className = "status-pill status-neutral";
  }

  return (
    <span className={className}>
      <i />
      {status}
    </span>
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

export default App;