import { useCallback, useEffect, useState } from "react";
import { apiFetch as fetch, readApiJson } from "./api";

function profilePhoto(gender) {
  if (gender === "male") return "/maleprofile.jpg";
  if (gender === "female") return "/femleprofile.jpg";
  return "";
}

export default function UserAccessPage({ role, permissions }) {
  const isAdmin = role === "admin";
  const canView = role !== "manager" || permissions?.users?.view === true;
  const canAdd = role !== "manager" || permissions?.users?.add === true;
  const canEdit = role === "manager" && permissions?.users?.edit === true;
  const canLoadResidents = role !== "manager" || permissions?.residents?.view === true;
  const [users, setUsers] = useState([]);
  const [residents, setResidents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [approvals, setApprovals] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const defaultAccountRole = isAdmin ? "manager" : "security";
  const [values, setValues] = useState({ name: "", email: "", password: "", role: defaultAccountRole, residentId: "", gender: "" });

  const load = useCallback(async () => {
    try {
      const responses = await Promise.all([
        fetch("/api/auth/users"),
        canLoadResidents ? fetch("/api/residents") : Promise.resolve(null),
        canView ? fetch("/api/auth/requests") : Promise.resolve(null),
      ]);
      const [ur, rr, qr] = responses;
      const [u, r, q] = await Promise.all([
        readApiJson(ur),
        rr ? readApiJson(rr) : Promise.resolve([]),
        qr ? readApiJson(qr) : Promise.resolve([]),
      ]);
      if (!ur.ok) throw new Error(u.message || "Could not load accounts.");
      if (rr && !rr.ok) throw new Error(r.message || "Could not load residents.");
      if (qr && !qr.ok) throw new Error(q.message || "Could not load pending account requests.");
      setUsers(u);
      setResidents(r);
      setRequests(q);
      setError("");
    } catch (cause) {
      setError(cause.message || "Could not load account access.");
    }
  }, [canLoadResidents, canView]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function create(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, gender: values.gender || null, residentId: values.role === "resident" ? Number(values.residentId) : null }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not create account.");
      setValues({ name: "", email: "", password: "", role: defaultAccountRole, residentId: "", gender: "" });
      await load();
    } catch (cause) {
      setError(cause.message || "Could not create account.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(user) {
    try {
      const response = await fetch(`/api/auth/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !Number(user.active) }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not update account.");
      await load();
    } catch (cause) {
      setError(cause.message || "Could not update account.");
    }
  }

  async function reviewRequest(request, action) {
    setError("");
    const approval = approvals[request.id] || { role: "resident", residentId: "" };
    try {
      const response = await fetch(`/api/auth/requests/${request.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: approval.role,
          residentId: approval.role === "resident" ? Number(approval.residentId) : null,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not review account request.");
      await load();
    } catch (cause) {
      setError(cause.message || "Could not review account request.");
    }
  }

  function updateApproval(requestId, key, value) {
    setApprovals((current) => ({
      ...current,
      [requestId]: { role: "resident", residentId: "", ...current[requestId], [key]: value },
    }));
  }

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">SECURITY & ACCESS</p><h1>Account permissions</h1><p className="welcome-subtitle">{isAdmin ? "Create role-based accounts and review community access requests." : "Create Security and Resident accounts for your community."}</p></div>
    </section>
    {error && <p className="flat-error" role="alert">{error}</p>}

    {canView && canAdd && <section className="panel residents-panel">
      <div className="panel-heading"><div><h2>Pending access requests</h2><p>Verify each request before granting access to community information.</p></div></div>
      {requests.length === 0 ? <p className="empty-state">No pending account requests.</p> : <div className="table-wrapper"><table>
        <thead><tr><th>Applicant</th><th>Requested</th><th>Approve as</th><th>Resident link</th><th>Review</th></tr></thead>
        <tbody>{requests.map((request) => {
          const approval = approvals[request.id] || { role: "resident", residentId: "" };
          return <tr key={request.id}>
            <td><div className="resident-cell"><div className="resident-avatar">
              {profilePhoto(request.gender) ? <img src={profilePhoto(request.gender)} alt="" /> : request.name.slice(0, 2).toUpperCase()}
            </div><div><strong>{request.name}</strong><span>{request.email}</span></div></div></td>
            <td>{new Date(request.createdAt).toLocaleDateString()}</td>
            <td><select value={approval.role} onChange={(event) => updateApproval(request.id, "role", event.target.value)}>
              <option value="resident">Resident</option>{isAdmin && <option value="manager">Manager</option>}<option value="security">Security</option>
            </select></td>
            <td>{approval.role === "resident" ? <select required value={approval.residentId} onChange={(event) => updateApproval(request.id, "residentId", event.target.value)}>
              <option value="">Choose resident</option>{residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name} · {resident.block} {resident.flat}</option>)}
            </select> : "Not required"}</td>
            <td><div className="resident-home-actions">
              <button type="button" className="primary-button" disabled={approval.role === "resident" && !approval.residentId} onClick={() => void reviewRequest(request, "approve")}>Approve</button>
              <button type="button" className="secondary-button" onClick={() => void reviewRequest(request, "reject")}>Reject</button>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>}

    {canAdd && <form className="panel resident-form" onSubmit={create}>
      <div className="panel-heading"><div><h2>Create account</h2><p>{isAdmin ? "Passwords require 12 characters and are stored as salted hashes." : "Managers can create Security and Resident accounts only. Passwords require 12 characters."}</p></div></div>
      <div className="form-grid">
        <label>Name<input required maxLength="120" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label>
        <label>Email<input type="email" required value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
        <label>Temporary password<input type="password" minLength="12" required value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} /></label>
        <label>Role<select value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value, residentId: "" })}>{isAdmin && <option value="manager">Manager</option>}<option value="security">Security</option><option value="resident">Resident</option></select></label>
        <label>Profile image<select value={values.gender} onChange={(event) => setValues({ ...values, gender: event.target.value })}><option value="">Initials</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
        {values.role === "resident" && <label>Link resident record<select required value={values.residentId} onChange={(event) => setValues({ ...values, residentId: event.target.value })}><option value="">Choose resident</option>{residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name} · {resident.block} {resident.flat}</option>)}</select></label>}
      </div>
      <button className="primary-button" disabled={saving}>{saving ? "Creating…" : "Create account"}</button>
    </form>}

    {canView && <section className="panel residents-panel"><div className="panel-heading"><div><h2>Accounts</h2><p>{isAdmin ? "Administrator account status can’t be deactivated from its own session." : "Accounts in your community."}</p></div></div>
      <div className="table-wrapper"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Access</th></tr></thead>
        <tbody>{users.map((user) => <tr key={user.id}>
          <td><div className="resident-cell"><div className="resident-avatar">{profilePhoto(user.gender) ? <img src={profilePhoto(user.gender)} alt="" /> : user.name.slice(0, 2).toUpperCase()}</div><strong>{user.name}</strong></div></td>
          <td>{user.email}</td><td>{user.role}</td><td>{user.active ? "Active" : "Disabled"}</td>
          <td>{isAdmin || (canEdit && ["resident", "security"].includes(user.role)) ? <button className="secondary-button" onClick={() => void toggle(user)}>{user.active ? "Disable" : "Enable"}</button> : "View only"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </>;
}
