import { Fragment, useCallback, useEffect, useState } from "react";
import { apiFetch as fetch, readApiJson } from "./api";

const modules = [
  ["dashboard", "Dashboard"],
  ["residents", "Residents"],
  ["flats", "Flats & blocks"],
  ["amenities", "Amenities"],
  ["bookings", "Bookings"],
  ["maintenance", "Maintenance"],
  ["payments", "Payments"],
  ["complaints", "Complaints"],
  ["vehicles", "Vehicles"],
  ["visitors", "Visitors"],
  ["notices", "Notices"],
  ["reports", "Reports"],
  ["tenants", "Tenants"],
  ["users", "Account permissions"],
];
const actions = ["view", "add", "edit", "delete"];

function emptyPermissions(value = {}) {
  return Object.fromEntries(modules.map(([moduleName]) => [
    moduleName,
    Object.fromEntries(actions.map((action) => [
      action,
      value[moduleName]?.[action] === true || (moduleName === "dashboard" && action === "view" && !value[moduleName]),
    ])),
  ]));
}

export default function AdminPanel({ onSocietyCreated }) {
  const [societies, setSocieties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [societyName, setSocietyName] = useState("");
  const [manager, setManager] = useState({ name: "", email: "", password: "", societyId: "" });
  const [editingManager, setEditingManager] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [societyResponse, managerResponse] = await Promise.all([
        fetch("/api/auth/admin/societies"),
        fetch("/api/auth/admin/managers"),
      ]);
      const [societyData, managerData] = await Promise.all([
        readApiJson(societyResponse),
        readApiJson(managerResponse),
      ]);
      if (!societyResponse.ok) throw new Error(societyData.message || "Could not load societies.");
      if (!managerResponse.ok) throw new Error(managerData.message || "Could not load managers.");
      setSocieties(societyData);
      setManagers(managerData);
      setManager((value) => ({ ...value, societyId: value.societyId || String(societyData[0]?.id || "") }));
    } catch (cause) {
      setError(cause.message || "Could not load administrator data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function createSociety(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/societies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: societyName }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not create society.");
      setSocietyName("");
      await load();
      onSocietyCreated?.();
    } catch (cause) {
      setError(cause.message || "Could not create society.");
    } finally {
      setSaving(false);
    }
  }

  async function createManager(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/admin/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...manager, societyId: Number(manager.societyId) }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not create manager.");
      setManager((value) => ({ ...value, name: "", email: "", password: "" }));
      await load();
    } catch (cause) {
      setError(cause.message || "Could not create manager.");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(item) {
    setEditingManager(item.id);
    setPermissions(emptyPermissions(item.managerPermissions));
  }

  function changePermission(moduleName, action, checked) {
    setPermissions((current) => ({
      ...current,
      [moduleName]: action === "view" && !checked
        ? Object.fromEntries(actions.map((item) => [item, false]))
        : { ...current[moduleName], [action]: checked, ...(action !== "view" && checked ? { view: true } : {}) },
    }));
  }

  async function savePermissions(managerId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/admin/managers/${managerId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not save manager permissions.");
      setEditingManager(null);
      await load();
    } catch (cause) {
      setError(cause.message || "Could not save manager permissions.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="admin-panel">
    <section className="welcome-row"><div><p className="eyebrow">PLATFORM ADMINISTRATION</p><h1>Societies & manager access</h1><p className="welcome-subtitle">Create societies, manage managers, and assign granular access.</p></div></section>
    {error && <p className="flat-error" role="alert">{error}</p>}

    <section className="panel residents-panel">
      <div className="panel-heading"><div><h2>Societies</h2><p>Create communities, then assign managers to each society.</p></div></div>
      <form className="resident-form" onSubmit={createSociety}>
        <div className="form-grid"><label>Society name<input required maxLength="150" value={societyName} onChange={(event) => setSocietyName(event.target.value)} /></label></div>
        <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Add society"}</button>
      </form>
      {loading ? <p>Loading societies…</p> : societies.length === 0 ? <p className="empty-state">No societies yet. Add one before creating a manager.</p> : <div className="table-wrapper"><table><thead><tr><th>Society</th><th>ID</th></tr></thead><tbody>{societies.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.id}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="panel residents-panel">
      <div className="panel-heading"><div><h2>Create a manager</h2><p>Each manager belongs to one society. Only administrators can change manager permissions.</p></div></div>
      <form className="resident-form" onSubmit={createManager}>
        <div className="form-grid">
          <label>Name<input required maxLength="120" value={manager.name} onChange={(event) => setManager({ ...manager, name: event.target.value })} /></label>
          <label>Email<input type="email" required value={manager.email} onChange={(event) => setManager({ ...manager, email: event.target.value })} /></label>
          <label>Temporary password<input type="password" minLength="12" maxLength="200" required value={manager.password} onChange={(event) => setManager({ ...manager, password: event.target.value })} /></label>
          <label>Society<select required value={manager.societyId} onChange={(event) => setManager({ ...manager, societyId: event.target.value })}><option value="" disabled>Choose a society</option>{societies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <button className="primary-button" disabled={saving || societies.length === 0}>{saving ? "Creating…" : "Create manager"}</button>
      </form>
    </section>

    <section className="panel residents-panel">
      <div className="panel-heading"><div><h2>Manager permissions</h2><p>Permissions apply only to the manager’s assigned society. Managers cannot grant or change anyone’s permissions.</p></div></div>
      {loading ? <p>Loading managers…</p> : managers.length === 0 ? <p className="empty-state">No managers have been created.</p> : <div className="table-wrapper"><table><thead><tr><th>Manager</th><th>Email</th><th>Society</th><th>Access</th></tr></thead><tbody>{managers.map((item) => <Fragment key={item.id}>
        <tr><td>{item.name}</td><td>{item.email}</td><td>{item.societyName}</td>
          <td><button className="secondary-button" type="button" onClick={() => editingManager === item.id ? setEditingManager(null) : beginEdit(item)}>{editingManager === item.id ? "Cancel" : "Set permissions"}</button></td>
        </tr>
        {editingManager === item.id && <tr><td colSpan="4"><div className="manager-permissions">
          <div className="manager-permissions-row manager-permissions-heading"><strong>Module</strong>{actions.map((action) => <strong key={action}>{action}</strong>)}</div>
          {modules.map(([moduleName, label]) => <div className="manager-permissions-row" key={moduleName}>
            <span>{label}</span>
            {actions.map((action) => <label key={action} aria-label={`${label} ${action}`}><input type="checkbox" checked={Boolean(permissions[moduleName]?.[action])} onChange={(event) => changePermission(moduleName, action, event.target.checked)} /></label>)}
          </div>)}
          <button className="primary-button" type="button" disabled={saving} onClick={() => void savePermissions(item.id)}>{saving ? "Saving…" : "Save permissions"}</button>
        </div></td></tr>}
      </Fragment>)}</tbody></table></div>}
    </section>
  </div>;
}
