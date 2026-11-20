import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiJson } from "./api";

const initialForm = {
  name: "",
  email: "",
  phone: "",
  flatId: "",
  moveIn: "",
  moveOut: "",
  emergencyContact: "",
  familyMembers: "",
  vehicleRegistration: "",
  status: "Active",
  idProof: null,
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

export default function TenantsPage({ currentUser }) {
  const isResident = currentUser.role === "resident";
  const allSocietiesView = typeof window !== "undefined" && window.localStorage.getItem("nestora-admin-society-id") === "all";
  const [tenants, setTenants] = useState([]);
  const [flats, setFlats] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/residents/tenants");
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not load tenant records.");
      setTenants(data);
    } catch (cause) {
      setError(cause.message || "Could not load tenant records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadTenants); }, [loadTenants]);

  useEffect(() => {
    if (!isResident) return;
    let active = true;
    apiFetch("/api/residents/tenant-options")
      .then(async (response) => {
        const data = await readApiJson(response);
        if (!response.ok) throw new Error(data.message || "Could not load your flat.");
        if (!active) return;
        setFlats(data);
        setForm((value) => ({ ...value, flatId: String(data[0]?.id || "") }));
      })
      .catch((cause) => { if (active) setError(cause.message || "Could not load your flat."); });
    return () => { active = false; };
  }, [isResident]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== "") formData.set(key, value);
      });
      const response = await apiFetch("/api/residents/tenants", { method: "POST", body: formData });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not add tenant.");
      setNotice(data.message);
      setForm({ ...initialForm, flatId: String(flats[0]?.id || "") });
      await loadTenants();
    } catch (cause) {
      setError(cause.message || "Could not add tenant.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadProof(tenant) {
    setError("");
    try {
      const response = await apiFetch(`/api/residents/tenants/${tenant.id}/proof`, {
        headers: tenant.societyId ? { "X-Society-ID": String(tenant.societyId) } : undefined,
      });
      if (!response.ok) {
        const data = await readApiJson(response);
        throw new Error(data.message || "Could not download ID proof.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `tenant-${tenant.id}-id-proof`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause.message || "Could not download ID proof.");
    }
  }

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">{isResident ? "HOUSEHOLD MANAGEMENT" : "COMMUNITY DIRECTORY"}</p><h1>{isResident ? "My tenants" : "Tenants"}</h1>
        <p className="welcome-subtitle">{isResident ? "Add tenants for your flat. The tenant receives a welcome email, and you receive an email with their details." : "Tenant details submitted by residents in this society."}</p>
      </div>
    </section>
    {error && <p className="flat-error" role="alert">{error}</p>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    {isResident && <form className="panel resident-form" onSubmit={(event) => void submit(event)}>
      <div className="panel-heading"><div><h2>Add a tenant</h2><p>The tenant receives an account setup link and you receive their details by email. ID proof is optional, private, and limited to PDF, JPG, or PNG (5 MB max).</p></div></div>
      <div className="form-grid">
        <label>Tenant name *<input required maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Flat number *<select required value={form.flatId} disabled={!flats.length} onChange={(event) => setForm({ ...form, flatId: event.target.value })}><option value="">Choose your flat</option>{flats.map((flat) => <option key={flat.id} value={flat.id}>{flat.block} · {flat.flat}</option>)}</select></label>
        <label>Phone number *<input required type="tel" maxLength="30" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>Email address *<input required type="email" maxLength="190" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Move-in date *<input required type="date" value={form.moveIn} onChange={(event) => setForm({ ...form, moveIn: event.target.value })} /></label>
        <label>Move-out date<input type="date" min={form.moveIn || undefined} value={form.moveOut} onChange={(event) => setForm({ ...form, moveOut: event.target.value })} /></label>
        <label>Emergency contact number<input type="tel" maxLength="30" value={form.emergencyContact} onChange={(event) => setForm({ ...form, emergencyContact: event.target.value })} /></label>
        <label>Number of family members<input type="number" min="1" max="100" value={form.familyMembers} onChange={(event) => setForm({ ...form, familyMembers: event.target.value })} /></label>
        <label>Vehicle registration number<input maxLength="32" value={form.vehicleRegistration} onChange={(event) => setForm({ ...form, vehicleRegistration: event.target.value })} /></label>
        <label>Tenant status *<select required value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="Active">Active</option><option value="Moved Out">Moved Out</option></select></label>
        <label>Tenant ID proof<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setForm({ ...form, idProof: event.target.files?.[0] || null })} /></label>
      </div>
      <button className="primary-button" disabled={saving || flats.length === 0}>{saving ? "Adding tenant…" : "Add tenant"}</button>
    </form>}
    <section className="panel residents-panel">
      <div className="panel-heading"><div><h2>Tenant records</h2><p>{tenants.length} tenant{tenants.length === 1 ? "" : "s"}</p></div><button className="secondary-button" type="button" onClick={() => void loadTenants()} disabled={loading}>Refresh</button></div>
      <div className="table-wrapper"><table>
        <thead><tr>{allSocietiesView && <th>Society</th>}<th>Tenant</th><th>Contact</th><th>Flat</th><th>Move-in</th><th>Move-out</th><th>Household</th><th>Vehicle</th><th>Status</th><th>ID proof</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={allSocietiesView ? 10 : 9}>Loading tenant records…</td></tr>
            : tenants.length === 0 ? <tr><td colSpan={allSocietiesView ? 10 : 9}>No tenant records found.</td></tr>
              : tenants.map((tenant) => <tr key={`${tenant.societyId || ""}-${tenant.id}`}>
                {allSocietiesView && <td>{tenant.societyName}</td>}<td>{tenant.name}</td><td>{tenant.phone}<br />{tenant.email}</td><td>{tenant.block} · {tenant.flat}</td>
                <td>{formatDate(tenant.moveIn)}</td>
                <td>{formatDate(tenant.moveOut)}</td>
                <td>{tenant.familyMembers ?? "—"}</td><td>{tenant.vehicleRegistration || "—"}</td><td>{tenant.status}</td>
                <td>{tenant.idProofAvailable ? <button className="secondary-button" type="button" onClick={() => void downloadProof(tenant)}>Download</button> : "—"}</td>
              </tr>)}
        </tbody>
      </table></div>
    </section>
  </>;
}
