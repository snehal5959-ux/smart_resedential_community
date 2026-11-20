import { useCallback, useEffect, useState } from "react";
import { apiFetch as fetch, readApiJson } from "./api";

const definitions = {
  securityUnits: { title: "Unit directory", eyebrow: "GATE SECURITY", description: "Read-only unit and occupancy information for your community.", icon: "▦", endpoint: "flats/security-directory", columns: [["block","Block"],["flat","Unit"],["floor","Floor"],["flatType","Type"],["occupancy","Occupancy"]] },
  vehicles: { title: "Vehicle parking", eyebrow: "PARKING MANAGEMENT", description: "Register vehicles and manage parking for this society.", icon: "▱", endpoint: "vehicles", fields: [["flatId","Flat","flat",true],["number","Vehicle number","text",true],["type","Vehicle type","vehicleType",true],["parking","Parking slot","text"]], columns: [["number","Vehicle number"],["resident","Resident"],["block","Block"],["flat","Flat"],["type","Type"],["parking","Parking slot"],["status","Status"]], addText: "Register vehicle", statusOptions: ["Active","Inactive"] },
  amenities: { title: "Amenities", eyebrow: "COMMUNITY FACILITIES", description: "Maintain the facilities residents can book.", icon: "✦", endpoint: "amenities", fields: [["name","Amenity name","text",true],["description","Description","textarea"],["capacity","Capacity","number"],["hourlyRate","Hourly rate","number"]], columns: [["name","Amenity"],["description","Description"],["capacity","Capacity"],["hourlyRate","Hourly rate"],["status","Status"]], addText: "Add amenity" },
  bookings: { title: "Amenity bookings", eyebrow: "BOOKING MANAGEMENT", description: "Submit and review facility bookings. Overlapping active bookings are blocked.", icon: "◷", endpoint: "bookings", fields: [["amenityId","Amenity","amenity",true],["startAt","Start","datetime-local",true],["endAt","End","datetime-local",true],["notes","Notes","text"]], columns: [["resident","Resident"],["amenity","Amenity"],["startAt","Start"],["endAt","End"],["status","Status"]], addText: "New booking", statusOptions: ["Pending","Confirmed","Cancelled","Completed"] },
  maintenance: { title: "Maintenance bills", eyebrow: "BILLING", description: "Create bills for a flat and track the remaining balance.", icon: "⌁", endpoint: "maintenance", fields: [["flatId","Flat","flat",true],["amount","Amount","number",true],["period","Billing period","text",true],["dueDate","Due date","date",true]], columns: [["flat","Flat"],["block","Block"],["period","Period"],["amount","Billed"],["paid","Paid"],["balance","Balance"],["dueDate","Due date"],["status","Status"]], addText: "Create bill" },
  payments: { title: "Payments", eyebrow: "PAYMENT MANAGEMENT", description: "Pay outstanding community bills securely or review payment receipts.", icon: "₹", endpoint: "payments", fields: [["billId","Outstanding bill","bill",true],["amount","Payment amount","number",true],["method","Method","method",true],["reference","Reference","text"]], columns: [["receipt","Receipt"],["paidBy","Paid by"],["flat","Flat"],["period","Period"],["amount","Amount"],["method","Method"],["reference","Reference"],["paidAt","Paid at"]], addText: "Record payment" },
  complaints: { title: "Complaints", eyebrow: "SERVICE DESK", description: "Submit concerns and follow their resolution status.", icon: "!", endpoint: "complaints", fields: [["subject","Subject","text",true],["category","Category","category",true],["description","Details","textarea",true],["priority","Priority","priority",true]], columns: [["id","ID"],["resident","Resident"],["flat","Flat"],["subject","Subject"],["category","Category"],["priority","Priority"],["status","Status"],["createdAt","Reported"]], addText: "New complaint", statusOptions: ["Open","In Progress","Resolved"] },
  visitors: { title: "Visitor log", eyebrow: "GATE SECURITY", description: "Register expected guests and record arrival and departure.", icon: "↗", endpoint: "visitors", fields: [["flatId","Visiting flat","flat",true],["name","Visitor name","text",true],["phone","Phone","text"],["purpose","Purpose","text",true],["expectedAt","Expected arrival","datetime-local",true]], columns: [["name","Visitor"],["flat","Flat"],["block","Block"],["purpose","Purpose"],["expectedAt","Expected"],["status","Status"]], addText: "Register visitor", statusOptions: ["Expected","Checked In","Checked Out"] },
  notices: { title: "Community notices", eyebrow: "COMMUNITY COMMUNICATION", description: "Publish announcements for residents and keep drafts private.", icon: "▤", endpoint: "notices", fields: [["title","Title","text",true],["description","Notice","textarea",true],["audience","Audience","audience",true],["status","Publish status","publish",true]], columns: [["title","Notice"],["description","Details"],["audience","Audience"],["status","Status"],["publishedAt","Published"]], addText: "Create notice", statusOptions: ["Draft","Published","Archived"] },
};

const dateOnlyFields = new Set(["dueDate"]);
const dateTimeFields = new Set(["startAt", "endAt", "paidAt", "expectedAt", "checkedInAt", "checkedOutAt", "createdAt"]);

function formatCell(key, value) {
  if (value == null) return "—";
  if (!dateOnlyFields.has(key) && !dateTimeFields.has(key)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateOnlyFields.has(key) ? date.toLocaleDateString() : date.toLocaleString();
}

export default function DataPage({ resource, role: suppliedRole, permissions, openForm = false }) {
  if (resource === "notices") return <NoticesPage suppliedRole={suppliedRole} permissions={permissions} />;
  return <ResourceDataPage resource={resource} suppliedRole={suppliedRole} permissions={permissions} openForm={openForm} />;
}

function NoticesPage({ suppliedRole, permissions }) {
  const [role, setRole] = useState(suppliedRole || "");
  const [data, setData] = useState({ society: [], calendar: [], calendarAvailable: true, location: "Pune, Maharashtra, India" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({ title: "", description: "", audience: "All Residents", status: "Published" });
  const allSocietiesView = typeof window !== "undefined" && window.localStorage.getItem("nestora-admin-society-id") === "all";
  const canAdd = !allSocietiesView && role === "manager" && permissions?.notices?.add === true;
  const canEdit = !allSocietiesView && role === "manager" && permissions?.notices?.edit === true;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/notices");
      const result = await readApiJson(response);
      if (!response.ok) throw new Error(result.message || "Could not load notices.");
      setData(result);
    } catch (cause) { setError(cause.message || "Could not load notices."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (suppliedRole) return;
    fetch("/api/auth/session").then(readApiJson).then((result) => setRole(result.user.role)).catch(() => setRole(""));
  }, [suppliedRole]);

  function prepareArrangement(item) {
    if (!canAdd) return;
    setValues({ title: `${item.title} · Society arrangements`, description: `Society arrangements for ${item.title} on ${item.date}. Please add confirmed timings, venue, and resident instructions.`, audience: "All Residents", status: "Draft" });
    setOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await readApiJson(response);
      if (!response.ok) throw new Error(result.message || "Could not save society notice.");
      setOpen(false); setValues({ title: "", description: "", audience: "All Residents", status: "Published" }); await load();
    } catch (cause) { setError(cause.message || "Could not save society notice."); }
    finally { setSaving(false); }
  }

  async function updateStatus(notice, status) {
    setError("");
    try {
      const response = await fetch(`/api/notices/${notice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await readApiJson(response);
      if (!response.ok) throw new Error(result.message || "Could not update notice.");
      await load();
    } catch (cause) { setError(cause.message || "Could not update notice."); }
  }

  return <>
    <section className="welcome-row"><div><p className="eyebrow">COMMUNITY COMMUNICATION</p><h1>Notices & calendar</h1><p className="welcome-subtitle">Upcoming country and regional observances, alongside official society announcements.</p></div>{canAdd && <button className="primary-button" onClick={() => { setValues({ title: "", description: "", audience: "All Residents", status: "Published" }); setOpen((value) => !value); }}>+ Create society notice</button>}</section>
    {error && <section className="panel flat-message" role="alert"><p>{error}</p><button className="secondary-button" onClick={load}>Retry</button></section>}
    {open && canAdd && <form className="panel resident-form" onSubmit={submit}><h2>Society notice</h2><p>Community managers with notice-add permission can publish society announcements.</p><div className="form-grid"><label>Title<input required maxLength="180" value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label><label>Audience<select value={values.audience} onChange={(event) => setValues({ ...values, audience: event.target.value })}>{["All Residents", "Owners", "Tenants", "Staff"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Notice details<textarea required rows="4" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label><label>Publication status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}><option>Draft</option><option>Published</option></select></label></div><div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save notice"}</button><button className="secondary-button" type="button" onClick={() => setOpen(false)}>Cancel</button></div></form>}
    <section className="panel notice-feed-panel"><div className="panel-heading"><div><h2>Calendar observances</h2><p>{data.location} · refreshed automatically from the public holiday calendar</p></div><button className="secondary-button" onClick={load} disabled={loading}>Refresh</button></div>{!data.calendarAvailable && <p className="calendar-source-note" role="status">The public calendar is temporarily unavailable. Society notices are still available.</p>}{loading ? <p>Loading calendar…</p> : data.calendar.length === 0 ? <p className="empty-state">No upcoming national or configured regional observances in the next six months.</p> : <div className="calendar-notice-grid">{data.calendar.map((item) => <article className="calendar-notice-card" key={item.id}><div className="calendar-notice-meta"><span>{item.scope}</span><time dateTime={item.date}>{new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</time></div><h3>{item.title}</h3><p>{item.description}</p>{canAdd && <button className="text-button" onClick={() => prepareArrangement(item)}>Plan society arrangements</button>}</article>)}</div>}</section>
    <section className="panel notice-feed-panel"><div className="panel-heading"><div><h2>Society notices</h2><p>Announcements created and managed by your society team.</p></div></div>{loading ? <p>Loading notices…</p> : data.society.length === 0 ? <p className="empty-state">No society notices have been published.</p> : <div className="society-notice-list">{data.society.map((notice) => <article className="society-notice-item" key={`${notice.societyId || ""}-${notice.id}`}><div><div className="calendar-notice-meta"><span>{notice.audience}</span><span>{notice.status}</span>{allSocietiesView && <span>{notice.societyName}</span>}</div><h3>{notice.title}</h3><p>{notice.description}</p><small>{notice.publishedAt ? `Published ${new Date(notice.publishedAt).toLocaleString()}` : "Draft"}</small></div>{canEdit && <select aria-label={`Update ${notice.title}`} value={notice.status} onChange={(event) => updateStatus(notice, event.target.value)}>{["Draft", "Published", "Archived"].map((status) => <option key={status}>{status}</option>)}</select>}</article>)}</div>}</section>
  </>;
}

function ResourceDataPage({ resource, role: suppliedRole, permissions, openForm }) {
  const [role, setRole] = useState(suppliedRole || "");
  const config = definitions[resource];
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({ flats: [], amenities: [], bills: [] });
  const [values, setValues] = useState({});
  const [open, setOpen] = useState(() => Boolean(openForm));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const allSocietiesView = typeof window !== "undefined" && window.localStorage.getItem("nestora-admin-society-id") === "all";
  const tableColumns = allSocietiesView ? [["societyName", "Society"], ...config.columns] : config.columns;
  const canManage = role === "manager";
  const canAddPermission = role !== "manager" || permissions?.[resource]?.add === true;
  const canEditPermission = role !== "manager" || permissions?.[resource]?.edit === true;
  const canUpdate = !allSocietiesView && ((canManage && canEditPermission) || (resource === "visitors" && role === "security"));
  const canPay = resource === "payments" && ["resident", "tenant"].includes(role);
  const canAdd = !allSocietiesView && canAddPermission && (resource === "complaints"
    ? ["manager","resident","tenant"].includes(role)
    : (resource === "bookings" && (["resident","tenant"].includes(role) || canManage)) ||
      (resource === "visitors" && ["manager","security"].includes(role)) ||
      (resource === "notices" && canManage) ||
      (resource !== "complaints" && resource !== "bookings" && resource !== "visitors" && resource !== "notices" && resource !== "payments" && canManage) ||
      (resource === "payments" && canManage));

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/${config.endpoint}`);
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not load records.");
      setRows(data);
      if (["maintenance","payments","visitors","vehicles"].includes(resource) && ["admin","manager","security"].includes(role)) {
        const flatsResponse = await fetch("/api/flats/options"); const flats = await readApiJson(flatsResponse);
        if (flatsResponse.ok) setOptions((current) => ({ ...current, flats }));
      }
      if (resource === "bookings") {
        const response = await fetch("/api/amenities"); const amenities = await readApiJson(response);
        setOptions((current) => ({ ...current, amenities: response.ok ? amenities : [] }));
      }
      if (resource === "payments") {
        const response = await fetch("/api/maintenance?open=true"); const bills = await readApiJson(response);
        setOptions((current) => ({ ...current, bills: response.ok ? bills : [] }));
      }
    } catch (cause) { setError(cause.message || "Could not load data."); }
    finally { setLoading(false); }
  }, [config.endpoint, resource, role]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => {
    if (suppliedRole) return;
    fetch("/api/auth/session").then(readApiJson).then((data) => setRole(data.user.role)).catch(() => setRole(""));
  }, [suppliedRole]);

  function optionsFor(type) {
    if (type === "flat") return options.flats.map((item) => [item.id, `${item.block} · ${item.flat}${item.status ? ` · ${item.status}` : ""}`]);
    if (type === "amenity") return options.amenities.filter((item) => item.status === "Available").map((item) => [item.id, item.name]);
    if (type === "bill") return options.bills.filter((item) => Number(item.balance) > 0).map((item) => [item.id, `${item.block} ${item.flat} · ${item.period} · balance ₹${item.balance}`]);
    if (type === "method") return ["UPI","Card","Bank Transfer","Cash","Cheque"].map((item) => [item,item]);
    if (type === "category") return ["Plumbing","Electrical","Lift","Cleaning","Security","Other"].map((item) => [item,item]);
    if (type === "priority") return ["Low","Medium","High"].map((item) => [item,item]);
    if (type === "audience") return ["All Residents","Owners","Tenants","Staff"].map((item) => [item,item]);
    if (type === "publish") return ["Draft","Published"].map((item) => [item,item]);
    if (type === "vehicleType") return ["Car","Motorcycle","Scooter","Bicycle","Other"].map((item) => [item,item]);
    return [];
  }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const body = { ...values };
      for (const key of ["flatId","amenityId","billId","capacity","hourlyRate"]) if (body[key] !== undefined && body[key] !== "") body[key] = Number(body[key]);
      if (body.amount !== undefined) body.amount = Number(body.amount);
      const response = await fetch(`/api/${config.endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await readApiJson(response); if (!response.ok) throw new Error(data.message || "Could not save record.");
      setValues({}); setOpen(false); await load();
    } catch (cause) { setError(cause.message || "Could not save record."); }
    finally { setSaving(false); }
  }

  async function updateStatus(row, status) {
    try {
      const response = await fetch(`/api/${config.endpoint}/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await readApiJson(response); if (!response.ok) throw new Error(data.message || "Could not update record."); await load();
    } catch (cause) { setError(cause.message || "Could not update record."); }
  }

  async function payBill(bill) {
    setError("");
    setSaving(true);
    try {
      const scriptUrl = "https://checkout.razorpay.com/v1/checkout.js";
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = scriptUrl;
          script.onload = resolve;
          script.onerror = () => reject(new Error("Could not load the Razorpay checkout. Check your connection and try again."));
          document.body.appendChild(script);
        });
      }
      const orderResponse = await fetch("/api/payments/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId: bill.id }),
      });
      const order = await readApiJson(orderResponse);
      if (!orderResponse.ok) throw new Error(order.message || "Could not start payment.");
      let confirmationStarted = false;
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Nestora Community",
        description: order.description,
        order_id: order.orderId,
        handler: async (confirmation) => {
          confirmationStarted = true;
          try {
            const response = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(confirmation),
            });
            const result = await readApiJson(response);
            if (!response.ok) throw new Error(result.message || "Payment could not be verified.");
            setError("");
            await load();
          } catch (cause) {
            setError(cause.message || "Payment could not be verified. Refresh to check the receipt.");
          } finally {
            setSaving(false);
          }
        },
        modal: { ondismiss: () => { if (!confirmationStarted) setSaving(false); } },
      });
      checkout.on("payment.failed", (event) => {
        setError(event.error?.description || "The payment did not complete. You can retry this bill.");
        setSaving(false);
      });
      checkout.open();
    } catch (cause) {
      setError(cause.message || "Could not start payment.");
      setSaving(false);
    }
  }

  function exportCsv() {
    const content = [tableColumns.map(([,label]) => label), ...rows.map((row) => tableColumns.map(([key]) => row[key] ?? ""))].map((line) => line.map((value) => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); link.download = `${resource}-report.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <>
    <section className="welcome-row"><div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}</h1><p className="welcome-subtitle">{config.description}</p></div>{canAdd && <button className="primary-button" onClick={() => setOpen((current) => !current)}>+ {config.addText}</button>}</section>
    {error && <section className="panel flat-message" role="alert"><p>{error}</p><button className="secondary-button" onClick={load}>Retry</button></section>}
    {open && canAdd && <form className="panel resident-form" onSubmit={submit}><div className="form-grid">{config.fields.map(([key,label,type,required]) => <label key={key}>{label}{type === "textarea" ? <textarea required={required} rows="3" value={values[key] || ""} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /> : ["flat","amenity","bill","method","category","priority","audience","publish"].includes(type) ? <select required={required} value={values[key] || ""} onChange={(event) => setValues({ ...values, [key]: event.target.value })}><option value="">Choose {label.toLowerCase()}</option>{optionsFor(type).map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select> : <input required={required} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={values[key] || ""} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />}</label>)}</div><div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button><button className="secondary-button" type="button" onClick={() => setOpen(false)}>Cancel</button></div></form>}
    {canPay && <section className="panel residents-panel"><div className="panel-heading"><div><h2>Outstanding bills</h2><p>Pay the remaining amount securely through Razorpay.</p></div></div><div className="table-wrapper"><table><thead><tr><th>Flat</th><th>Period</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due date</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan="7">Loading bills…</td></tr> : options.bills.length === 0 ? <tr><td colSpan="7">You have no outstanding bills.</td></tr> : options.bills.map((bill) => <tr key={bill.id}><td>{bill.block} {bill.flat}</td><td>{bill.period}</td><td>₹{Number(bill.amount).toFixed(2)}</td><td>₹{Number(bill.paid).toFixed(2)}</td><td>₹{Number(bill.balance).toFixed(2)}</td><td>{bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : "—"}</td><td><button className="primary-button" disabled={saving} onClick={() => payBill(bill)}>{saving ? "Opening…" : "Pay bill"}</button></td></tr>)}</tbody></table></div></section>}
    <section className="management-summary"><div className="management-summary-icon">{config.icon}</div><div><strong>{loading ? "Loading…" : `${rows.length} records`}</strong><span>Live records from community database</span></div><div className="management-summary-right"><button className="text-button" onClick={exportCsv} disabled={loading || !rows.length}>Export CSV ↓</button><button className="secondary-button" onClick={load} disabled={loading}>Refresh</button></div></section>
    <section className="panel residents-panel"><div className="panel-heading"><div><h2>{config.title} records</h2><p>{allSocietiesView || role === "admin" ? "Read-only community records." : resource === "securityUnits" ? "Read-only unit and occupancy information for your community." : "Changes are stored in MySQL."}</p></div></div><div className="table-wrapper"><table><thead><tr>{tableColumns.map(([key,label]) => <th key={key}>{label}</th>)}{config.statusOptions && canUpdate && <th>Update</th>}</tr></thead><tbody>{loading ? <tr><td colSpan={tableColumns.length + (config.statusOptions && canUpdate ? 1 : 0)}>Loading…</td></tr> : rows.length === 0 ? <tr><td colSpan={tableColumns.length + (config.statusOptions && canUpdate ? 1 : 0)}>No records yet.</td></tr> : rows.map((row) => <tr key={`${row.societyId || ""}-${row.id}`}>{tableColumns.map(([key]) => <td key={key}>{formatCell(key, row[key])}</td>)}{config.statusOptions && canUpdate && <td><select aria-label={`Change status for ${config.title} ${row.id}`} value={row.status} onChange={(event) => updateStatus(row,event.target.value)}>{config.statusOptions.filter((status) => resource !== "visitors" || status === row.status || (row.status === "Expected" && status === "Checked In") || (row.status === "Checked In" && status === "Checked Out")).map((status) => <option key={status}>{status}</option>)}</select></td>}</tr>)}</tbody></table></div></section>
  </>;
}
