import { useEffect, useState } from "react";
import { apiFetch as fetch, readApiJson } from "./api";

const initialResetToken = new URLSearchParams(window.location.search).get("resetToken") || "";

export default function AuthScreen({ onSignedIn, notice = "" }) {
  const [ready, setReady] = useState(false);
  const [setup, setSetup] = useState(false);
  const [providers, setProviders] = useState({ google: false });
  const [societies, setSocieties] = useState([]);
  const [societyError, setSocietyError] = useState("");
  const [values, setValues] = useState({ name: "", email: "", password: "", gender: "", societyId: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formMode, setFormMode] = useState(initialResetToken ? "reset" : "login");
  const [resetToken] = useState(initialResetToken);
  const [error, setError] = useState(new URLSearchParams(window.location.search).get("authError") || "");
  const [statusMessage, setStatusMessage] = useState(notice);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("authError")) {
      url.searchParams.delete("authError");
      window.history.replaceState({}, "", url);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function checkAuthService() {
      try {
        const statusResponse = await fetch("/api/auth/status");
        const status = await readApiJson(statusResponse);
        if (!statusResponse.ok) throw new Error(status.message || "Sign-in is temporarily unavailable.");
        if (active) {
          setSetup(Boolean(status.setupRequired));
          setProviders(status.providers || { google: false });
        }
        try {
          const societyResponse = await fetch("/api/auth/societies");
          const communityData = await readApiJson(societyResponse);
          if (!societyResponse.ok) throw new Error(communityData.message || "Community list is temporarily unavailable.");
          if (active) {
            setSocieties(communityData);
            setSocietyError("");
            setValues((current) => ({ ...current, societyId: current.societyId || String(communityData[0]?.id || "") }));
          }
        } catch (cause) {
          if (active) setSocietyError(cause.message || "Community list is temporarily unavailable.");
        }
      } catch {
        if (active) {
          setError("We could not connect to sign-in. Check your connection and try again.");
          setAuthUnavailable(true);
        }
      } finally {
        if (active) setReady(true);
      }
    }
    void checkAuthService();
    return () => { active = false; };
  }, [statusAttempt]);

  function changeMode(mode) {
    setError("");
    setStatusMessage("");
    setConfirmPassword("");
    setValues((current) => ({ ...current, password: "" }));
    setFormMode(mode);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    if (formMode === "reset" && values.password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const path = formMode === "reset" ? "reset-password"
        : formMode === "forgot" ? "forgot-password"
          : formMode === "register" ? "register"
            : setup ? "setup" : "login";
      const body = formMode === "reset"
        ? { token: resetToken, password: values.password }
        : formMode === "forgot"
          ? { email: values.email }
          : { ...values, gender: values.gender || null, societyId: setup ? null : Number(values.societyId) };
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "We could not complete this request. Please try again.");
      if (formMode === "forgot") {
        setStatusMessage(data.message);
        return;
      }
      if (formMode === "register") {
        setStatusMessage(data.message);
        setValues((current) => ({ ...current, name: "", password: "", gender: "" }));
        setConfirmPassword("");
        setFormMode("login");
        return;
      }
      if (formMode === "reset") {
        setStatusMessage(data.message);
        setValues((current) => ({ ...current, password: "" }));
        setConfirmPassword("");
        setFormMode("login");
        const url = new URL(window.location.href);
        url.searchParams.delete("resetToken");
        window.history.replaceState({}, "", url);
        return;
      }
      if (!data.user) throw new Error("Sign-in did not return an account. Please try again.");
      onSignedIn(data.user);
    } catch (cause) {
      setError(cause instanceof TypeError
        ? "We could not connect to sign-in. Check your connection and try again."
        : (cause.message || "We could not complete this request. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const isAccountForm = formMode === "register" || setup;
  const showSocial = formMode === "login" && !setup;
  const passwordLabel = formMode === "reset" ? "New password" : setup || formMode === "register" ? "Create password" : "Password";
  const heading = formMode === "register" ? "Request access"
    : formMode === "forgot" ? "Reset password"
      : formMode === "reset" ? "Choose a new password"
        : setup ? "Create administrator" : "Welcome Back!";
  const description = formMode === "register" ? "Send an account request to your community administrator"
    : formMode === "forgot" ? "We’ll email a secure password reset link if your account exists"
      : formMode === "reset" ? "Choose a password with at least 12 characters"
        : setup ? "Set up the first administrator for your community" : "Sign in to your Nestora account";

  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <section className="auth-hero-panel" aria-label="Nestora home showcase">
          <div className="auth-brand-header">
            <div className="brand-mark" aria-hidden="true">N</div>
            <div className="auth-brand-copy">
              <strong>Nestora</strong>
              <span>Smart Living. Together.</span>
            </div>
          </div>

          <div className="auth-hero-art">
            <div className="auth-scripture">Smarter Community.<br /><span>Happier Living.</span></div>
            <div className="auth-building" aria-hidden="true" />
            <div className="auth-hero-overlay">
              <div className="auth-hero-logo">Nestora</div>
              <h1>Smart Residential<br />Management System</h1>
              <p>Manage your community effortlessly — from residents to facilities, all in one place.</p>
            </div>
          </div>

          <div className="auth-feature-grid">
            <div className="auth-feature-item">
              <img src="/manage_resident.jpg" alt="" />
              <small>Manage<br />Residents</small>
            </div>
            <div className="auth-feature-item">
              <img src="/monitor_smart_lock.jpg" alt="" />
              <small>Monitor<br />Smart Locks</small>
            </div>
            <div className="auth-feature-item">
              <img src="/book_aminities.jpg" alt="" />
              <small>Book<br />Amenities</small>
            </div>
            <div className="auth-feature-item">
              <img src="/track_complaints.jpg" alt="" />
              <small>Track<br />Complaints</small>
            </div>
          </div>
        </section>

        <aside className="auth-login-panel">
          <div className="auth-login-icon" aria-hidden="true">
            <div className="brand-mark auth-brand-mini">N</div>
          </div>

          <h2>{heading}</h2>
          <p>{description}</p>

          {statusMessage && <p className="auth-session-notice" role="status">{statusMessage}</p>}
          {error && <div className="auth-status-error" role="alert"><p>{error}</p>{authUnavailable && <button className="secondary-button" type="button" onClick={() => { setReady(false); setError(""); setAuthUnavailable(false); setStatusAttempt((value) => value + 1); }}>Try again</button>}</div>}

          {!ready && <div className="auth-loading">Connecting…</div>}

          {ready && !authUnavailable && formMode === "reset" && !resetToken && (
            <div className="auth-status-error" role="alert"><p>This reset link is incomplete. Request a new one.</p></div>
          )}

          {ready && !authUnavailable && (formMode !== "reset" || resetToken) && (
            <form className="auth-form" onSubmit={submit}>
              {isAccountForm && (
                <label>
                  Your name
                  <input autoComplete="name" required maxLength={120} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
                </label>
              )}

              {(isAccountForm || formMode === "forgot" || formMode === "login") && (
                <label>
                  Email Address
                  <input type="email" autoComplete="username" required placeholder="Email Address" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} />
                </label>
              )}

              {(isAccountForm || formMode === "reset" || formMode === "login") && (
                <label className="password-field">
                  {passwordLabel}
                  <div className="password-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete={isAccountForm ? "new-password" : formMode === "reset" ? "new-password" : "current-password"}
                      minLength={isAccountForm || formMode === "reset" ? 12 : undefined}
                      required
                      placeholder={passwordLabel}
                      value={values.password}
                      onChange={(event) => setValues({ ...values, password: event.target.value })}
                    />
                    <button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                      {showPassword ? "◌" : "◍"}
                    </button>
                  </div>
                </label>
              )}

              {formMode === "reset" && (
                <label>
                  Confirm new password
                  <input type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </label>
              )}

              {isAccountForm && !setup && (
                <>
                  {(societyError || societies.length === 0) && <p className="auth-inline-error" role="alert">{societyError || "No communities are available for registration. Contact your administrator."}</p>}
                  <label>
                    Community
                    <select required value={values.societyId} onChange={(event) => setValues({ ...values, societyId: event.target.value })}>
                      <option value="" disabled>Choose your community</option>
                      {societies.map((society) => <option key={society.id} value={society.id}>{society.name}</option>)}
                    </select>
                  </label>
                </>
              )}

              {setup && (
                <label>
                  Profile
                  <select value={values.gender} onChange={(event) => setValues({ ...values, gender: event.target.value })}>
                    <option value="">Choose profile image (optional)</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              )}
              {formMode === "login" && !setup && (
                <div className="auth-inline-row">
                  <label className="remember-wrap">
                    <input type="checkbox" defaultChecked />
                    <span>Remember me</span>
                  </label>
                  <button type="button" className="text-button auth-forgot" onClick={() => changeMode("forgot")}>Forgot Password?</button>
                </div>
              )}

              <button className="auth-login-button" disabled={busy || (formMode === "reset" && !resetToken)} type="submit">
                {busy ? "Please wait…" : formMode === "register" ? "Request access"
                  : formMode === "forgot" ? "Send reset link"
                    : formMode === "reset" ? "Update password"
                      : setup ? "Create administrator" : "Sign In"}
              </button>
            </form>
          )}

          {showSocial && <>
            <div className="auth-divider"><span>or continue with</span></div>
            <div className="auth-socials">
              <button type="button" className="social-button" onClick={() => window.location.assign("/api/auth/google")}>
                <img src="/google.avif" alt="" />Google
              </button>
            </div>
            {!providers.google && <p className="auth-provider-note">Google sign-in needs OAuth client credentials configured by your administrator.</p>}
          </>}

          {!setup && (formMode === "login" || formMode === "register" || formMode === "forgot" || formMode === "reset") && (
            <p className="auth-signup-row">
              {formMode === "login" ? <>New here? <button type="button" className="text-button auth-signup-link" onClick={() => changeMode("register")}>Register here</button></>
                : <>Already have an account? <button type="button" className="text-button auth-signup-link" onClick={() => changeMode("login")}>Sign in</button></>}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
