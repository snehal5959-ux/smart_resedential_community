import { useCallback, useEffect, useState } from "react";
import { apiFetch as fetch, readApiJson } from "./api";

function FlatStat({ title, value, icon }) {
  return (
    <article className="stat-card">
      <div className="stat-top"><div className="stat-icon blue">{icon}</div></div>
      <p>{title}</p><h2>{value}</h2>
    </article>
  );
}

function FlatStatus({ status }) {
  return <span className={`flat-status flat-status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}

function LockStatus({ status }) {
  const label = status === "not configured"
    ? "Not connected"
    : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`lock-status lock-status-${status.replaceAll(" ", "-")}`}>{label}</span>;
}

export default function FlatsPage({ role, permissions }) {
  const [flatList, setFlatList] = useState([]);
  const [lockEvents, setLockEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [eventError, setEventError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [flatNumber, setFlatNumber] = useState("");
  const [block, setBlock] = useState("A");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const allSocietiesView = typeof window !== "undefined" && window.localStorage.getItem("nestora-admin-society-id") === "all";
  const canAdd = !allSocietiesView && role === "manager" && permissions?.flats?.add === true;

  const loadFlats = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setEventError("");
    try {
      const flatsResponse = await fetch("/api/flats");
      const flatsData = await readApiJson(flatsResponse);
      if (!flatsResponse.ok) throw new Error(flatsData.message || "Could not load flats.");
      setFlatList(flatsData);

      try {
        const eventsResponse = await fetch("/api/flats/lock-events");
        const eventsData = await readApiJson(eventsResponse);
        if (!eventsResponse.ok) throw new Error(eventsData.message || "Could not load lock activity.");
        setLockEvents(eventsData);
      } catch (error) {
        setEventError(error.message || "Could not load lock activity.");
      }
    } catch (error) {
      setLoadError(error.message || "Could not connect to the database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadFlats); }, [loadFlats]);

  async function addFlat(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/flats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flat: flatNumber.trim(), block }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not save flat.");
      setFlatList((current) => [...current, data].sort((a, b) =>
        `${a.block} ${a.flat}`.localeCompare(`${b.block} ${b.flat}`)
      ));
      setFlatNumber("");
      setFormOpen(false);
    } catch (error) {
      setFormError(error.message || "Could not save flat.");
    } finally {
      setSaving(false);
    }
  }

  const occupiedCount = flatList.filter((flat) => flat.status === "Occupied").length;
  const lockedCount = flatList.filter((flat) => flat.lockStatus === "locked").length;
  const attentionCount = flatList.filter((flat) => flat.lockId && flat.lockStatus !== "locked").length;

  return (
    <>
      <section className="welcome-row">
        <div>
          <p className="eyebrow">PROPERTY MANAGEMENT</p>
          <h1>Flats &amp; Blocks</h1>
          <p className="welcome-subtitle">{role === "admin" ? "Read-only flat occupancy and smart lock security." : "Manage flat occupancy and monitor smart lock security."}</p>
        </div>
        {canAdd && <button className="primary-button" onClick={() => setFormOpen((open) => !open)}>+ Add Flat</button>}
      </section>

      {formOpen && canAdd && (
        <form className="panel resident-form flat-form" onSubmit={addFlat}>
          <div className="panel-heading"><div><h2>Add a flat</h2><p>Flat details are saved to the community database.</p></div></div>
          <div className="form-grid">
            <label>Flat number<input required maxLength={20} value={flatNumber} onChange={(event) => setFlatNumber(event.target.value)} placeholder="A-101" /></label>
            <label>Block<select value={block} onChange={(event) => setBlock(event.target.value)}><option value="A">Block A</option><option value="B">Block B</option><option value="C">Block C</option></select></label>
          </div>
          {formError && <p className="flat-error" role="alert">{formError}</p>}
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save flat"}</button>
        </form>
      )}

      {loadError && <section className="panel flat-message" role="alert"><strong>Could not load flat information.</strong><p>{loadError}</p><button className="secondary-button" onClick={loadFlats}>Try again</button></section>}

      <section className="stats-grid">
        <FlatStat title="Total flats" value={loading ? "—" : flatList.length} icon="▦" />
        <FlatStat title="Occupied" value={loading ? "—" : occupiedCount} icon="✓" />
        <FlatStat title="Vacant" value={loading ? "—" : flatList.length - occupiedCount} icon="○" />
        <FlatStat title="Blocks" value={loading ? "—" : new Set(flatList.map((flat) => flat.block)).size} icon="⌂" />
      </section>

      <section className="panel residents-panel">
        <div className="panel-heading">
          <div><h2>Flat Directory</h2><p>Occupancy and resident details from MySQL</p></div>
          <button className="secondary-button" onClick={loadFlats} disabled={loading}>Refresh</button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead><tr>{allSocietiesView && <th>Society</th>}<th>Flat</th><th>Block</th><th>Residents</th><th>Status</th><th>Smart lock</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={allSocietiesView ? 6 : 5}>Loading flats…</td></tr> : flatList.length === 0 ? (
                <tr><td colSpan={allSocietiesView ? 6 : 5}>No flats found in the database. Add a flat to get started.</td></tr>
              ) : flatList.map((flat) => (
                <tr key={`${flat.societyId || ""}-${flat.id}`}>
                  {allSocietiesView && <td>{flat.societyName}</td>}
                  <td><strong>{flat.flat}</strong></td><td>{flat.block}</td><td>{flat.residents || "—"}</td>
                  <td><FlatStatus status={flat.status} /></td><td><LockStatus status={flat.lockStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel lock-security-panel">
        <div className="panel-heading"><div><h2>Smart lock security</h2><p>Read-only device status and the latest audit events</p></div></div>
        <div className="lock-security-summary">
          <div><span>Online and locked</span><strong>{lockedCount}</strong></div>
          <div><span>Needs attention</span><strong>{attentionCount}</strong></div>
          <div><span>Recent events</span><strong>{lockEvents.length}</strong></div>
        </div>
        <p className="security-note">Lock credentials are never shown in this page. This view does not send unlock commands.</p>
        {eventError && <p className="flat-error" role="alert">{eventError}</p>}
        <div className="table-wrapper">
          <table>
            <thead><tr>{allSocietiesView && <th>Society</th>}<th>Time</th><th>Flat</th><th>Event</th><th>Details</th><th>Level</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={allSocietiesView ? 6 : 5}>Loading activity…</td></tr> : lockEvents.length === 0 ? (
                <tr><td colSpan={allSocietiesView ? 6 : 5}>No lock events recorded yet. Connected devices can report status and audit events here.</td></tr>
              ) : lockEvents.map((event) => (
                <tr key={`${event.societyId || ""}-${event.id}`}>
                  {allSocietiesView && <td>{event.societyName}</td>}
                  <td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}</td>
                  <td><strong>{event.flat}</strong><br />{event.block}</td><td>{event.type}</td>
                  <td>{event.description}</td><td><FlatStatus status={event.severity || "info"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
