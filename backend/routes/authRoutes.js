const express = require("express");
const db = require("../db");
const { mailTransport, sendPasswordResetEmail, sendManagerMessageEmail, sendAdminReplyEmail } = require("../mailer");
const {
	ensureAuthSchema,
	hashPassword,
	verifyPassword,
	cookieOptions,
	getCookie,
	createSession,
	currentUser,
	requireAuth,
	requireRole,
	requireCommunityAccount,
	requireManagerPermission,
	managerPermissionModules,
	managerPermissionActions,
	parseManagerPermissions,
} = require("../auth");
const crypto = require("crypto");

const router = express.Router();
const validRoles = ["admin", "manager", "resident", "tenant", "security"];
const loginAttempts = new Map();

function rateLimited(ip) {
	const now = Date.now();
	const recent = (loginAttempts.get(ip) || []).filter((time) => now - time < 15 * 60_000);
	loginAttempts.set(ip, [...recent, now]);
	return recent.length >= 8;
}

function validCredentials(email, password) {
	return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
		typeof password === "string" && password.length >= 12 && password.length <= 200;
}

function validId(value) {
	return /^\d+$/.test(String(value || "")) && Number(value) > 0;
}

function validGender(value) {
	return value === null || value === undefined || ["male", "female", "other"].includes(value);
}

function frontendUrl() {
	return (process.env.FRONTEND_URL || (process.env.FRONTEND_ORIGINS || "http://localhost:5174").split(",")[0].trim()).replace(/\/$/, "");
}

function providerConfigured(provider) {
	return Boolean(process.env[`${provider}_CLIENT_ID`] && process.env[`${provider}_CLIENT_SECRET`]);
}

function callbackUrl(req, provider) {
	const base = process.env.AUTH_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
	return `${base.replace(/\/$/, "")}/api/auth/${provider}/callback`;
}

function oauthCookieOptions(maxAge) {
	return `Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function redirectAuthError(res, message) {
	res.redirect(`${frontendUrl()}/?authError=${encodeURIComponent(message)}`);
}

router.get("/status", async (req, res) => {
	try {
		await ensureAuthSchema();
		const [[row]] = await db.query("SELECT COUNT(*) count FROM app_user");
		res.json({
			setupRequired: Number(row.count) === 0,
			providers: { google: providerConfigured("GOOGLE") },
			passwordResetAvailable: Boolean(mailTransport()),
		});
	} catch (error) {
		console.error("Auth status failed:", error.message);
		res.status(503).json({ message: "Authentication storage is unavailable." });
	}
});

router.get("/societies", async (req, res) => {
	try {
		const [rows] = await db.query("SELECT society_id id,society_name name FROM society ORDER BY society_name");
		res.json(rows);
	} catch (error) {
		console.error("Community list failed:", error.message);
		res.status(503).json({ message: "Community list is temporarily unavailable." });
	}
});

router.post("/societies", requireAuth, requireRole("admin"), async (req, res, next) => {
	const name = req.body?.name;
	if (typeof name !== "string" || !name.trim() || name.trim().length > 150) {
		return res.status(400).json({ message: "Enter a society name with no more than 150 characters." });
	}
	try {
		const [result] = await db.execute("INSERT INTO society (society_name) VALUES (?)", [name.trim()]);
		res.status(201).json({ id: result.insertId, name: name.trim() });
	} catch (error) { next(error); }
});

function validateManagerPermissions(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	if (Object.keys(value).some((moduleName) => !managerPermissionModules.includes(moduleName))) return null;
	const normalized = {};
	for (const moduleName of managerPermissionModules) {
		const modulePermissions = value[moduleName] || {};
		if (!modulePermissions || typeof modulePermissions !== "object" || Array.isArray(modulePermissions) ||
			Object.keys(modulePermissions).some((action) => !managerPermissionActions.includes(action)) ||
			Object.values(modulePermissions).some((allowed) => typeof allowed !== "boolean")) return null;
		normalized[moduleName] = Object.fromEntries(managerPermissionActions.map((action) => [action, modulePermissions[action] === true]));
		if (managerPermissionActions.some((action) => action !== "view" && normalized[moduleName][action])) {
			normalized[moduleName].view = true;
		}
	}
	return normalized;
}

router.get("/admin/societies", requireAuth, requireRole("admin"), async (req, res, next) => {
	try {
		const [rows] = await db.execute("SELECT society_id id,society_name name FROM society ORDER BY society_name");
		res.json(rows);
	} catch (error) { next(error); }
});

router.get("/admin/managers", requireAuth, requireRole("admin"), async (req, res, next) => {
	try {
		const [rows] = await db.execute(
			`SELECT u.user_id id,u.display_name name,u.email,u.society_id societyId,
				s.society_name societyName,u.manager_permissions managerPermissions
			FROM app_user u JOIN society s ON s.society_id=u.society_id
			WHERE u.role='manager' ORDER BY s.society_name,u.display_name`
		);
		res.json(rows.map((manager) => ({
			...manager,
			managerPermissions: parseManagerPermissions(manager.managerPermissions),
		})));
	} catch (error) { next(error); }
});

router.post("/admin/managers", requireAuth, requireRole("admin"), async (req, res, next) => {
	const { name, email, password, societyId, gender = null } = req.body || {};
	const numericSocietyId = Number(societyId);
	if (typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
		!validCredentials(email, password) || !validId(numericSocietyId) || !validGender(gender)) {
		return res.status(400).json({ message: "Enter a manager name, valid email, 12-character password, and society." });
	}
	try {
		const [[society]] = await db.execute("SELECT society_id FROM society WHERE society_id=?", [numericSocietyId]);
		if (!society) return res.status(400).json({ message: "Choose an existing society." });
		const managerPermissions = Object.fromEntries(managerPermissionModules.map((moduleName) => [
			moduleName,
			Object.fromEntries(managerPermissionActions.map((action) => [action, moduleName === "dashboard" && action === "view"])),
		]));
		const [result] = await db.execute(
			"INSERT INTO app_user (society_id,display_name,email,password_hash,role,gender,manager_permissions) VALUES (?,?,?,?,'manager',?,?)",
			[numericSocietyId, name.trim(), email.trim().toLowerCase(), hashPassword(password).encoded, gender, JSON.stringify(managerPermissions)]
		);
		res.status(201).json({ id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), societyId: numericSocietyId });
	} catch (error) { next(error); }
});

router.patch("/admin/managers/:id/permissions", requireAuth, requireRole("admin"), async (req, res, next) => {
	if (!validId(req.params.id)) return res.status(400).json({ message: "Manager ID is invalid." });
	const permissions = validateManagerPermissions(req.body?.permissions);
	if (!permissions) return res.status(400).json({ message: "Choose valid view, add, edit, or delete permissions for each module." });
	try {
		const [result] = await db.execute(
			"UPDATE app_user SET manager_permissions=? WHERE user_id=? AND role='manager'",
			[JSON.stringify(permissions), Number(req.params.id)]
		);
		if (!result.affectedRows) return res.status(404).json({ message: "Manager not found." });
		res.json({ message: "Manager permissions saved." });
	} catch (error) { next(error); }
});

router.get("/messages", requireAuth, requireCommunityAccount, async (req, res, next) => {
	if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ message: "Only managers and platform administrators can view messages." });
	try {
		const messageFilter = req.user.role === "admin"
			? "((m.recipient_user_id=? AND m.message_type IN ('manager_admin','event_invitation')) OR (m.sender_user_id=? AND m.message_type='admin_manager_reply'))"
			: "(m.recipient_user_id=? OR (m.sender_user_id=? AND m.message_type IN ('manager_admin','event_invitation')))";
		const [rows] = await db.execute(
			`SELECT m.message_id id,m.message_type type,m.subject,m.body,m.event_at eventAt,m.event_location eventLocation,
				m.read_at readAt,m.created_at createdAt,
				u.user_id senderId,u.display_name senderName,u.email senderEmail,
				recipient.user_id recipientId,recipient.display_name recipientName,s.society_name societyName
			FROM app_message m JOIN app_user u ON u.user_id=m.sender_user_id
			JOIN society s ON s.society_id=m.society_id
			LEFT JOIN app_user recipient ON recipient.user_id=m.recipient_user_id
			WHERE m.society_id=? AND ${messageFilter}
			ORDER BY m.created_at DESC,m.message_id DESC`,
			req.user.role === "admin"
				? [req.user.societyId, req.user.id, req.user.id]
				: [req.user.societyId, req.user.id, req.user.id]
		);
		res.json(rows);
	} catch (error) { next(error); }
});

router.post("/messages", requireAuth, requireRole("manager"), async (req, res, next) => {
	const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
	const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
	const type = req.body?.type === "event_invitation" ? "event_invitation" : "manager_admin";
	const eventAtValue = req.body?.eventAt;
	const eventAt = type === "event_invitation" ? new Date(eventAtValue) : null;
	const eventLocation = type === "event_invitation" && typeof req.body?.eventLocation === "string"
		? req.body.eventLocation.trim()
		: "";
	if (req.body?.type !== undefined && !["manager_admin", "event_invitation"].includes(req.body.type)) {
		return res.status(400).json({ message: "Choose a valid message type." });
	}
	if (!subject || subject.length > 180 || !body || body.length > 5000) {
		return res.status(400).json({ message: "Enter a subject and message of up to 5,000 characters." });
	}
	if (type === "event_invitation" && (typeof eventAtValue !== "string" || !Number.isFinite(eventAt.getTime()) || !eventLocation || eventLocation.length > 180)) {
		return res.status(400).json({ message: "Event invitations require a valid date and time and a venue of up to 180 characters." });
	}
	let connection;
	let admins;
	try {
		connection = await db.getConnection();
		await connection.beginTransaction();
		[admins] = await connection.execute("SELECT user_id id,email FROM app_user WHERE role='admin' AND is_active=1");
		if (!admins.length) {
			await connection.rollback();
			return res.status(503).json({ message: "No active platform administrator can receive this message yet." });
		}
		for (const admin of admins) {
			await connection.execute(
				"INSERT INTO app_message (society_id,sender_user_id,recipient_user_id,message_type,subject,body,event_at,event_location) VALUES (?,?,?,?,?,?,?,?)",
				[req.user.societyId, req.user.id, admin.id, type, subject, body, eventAt, eventLocation || null]
			);
		}
		await connection.commit();
	} catch (error) {
		if (connection) await connection.rollback();
		return next(error);
	} finally { if (connection) connection.release(); }

	let emailSent = true;
	try {
		const [[society]] = await db.execute("SELECT society_name name FROM society WHERE society_id=?", [req.user.societyId]);
		for (const admin of admins) {
			const sent = await sendManagerMessageEmail({
				to: admin.email,
				managerName: req.user.name,
				societyName: society.name,
				subject,
				body,
				eventAt,
				eventLocation,
				eventInvitation: type === "event_invitation",
			});
			emailSent = emailSent && sent;
		}
	} catch (error) {
		emailSent = false;
		console.error("Manager-to-admin email notification failed:", error.message);
	}
	res.status(201).json({
		message: emailSent ? "Message sent to the platform administrator and email notifications were sent." : "Message saved in the platform inbox, but email notification could not be sent.",
		emailSent,
	});
});

router.post("/messages/:id/reply", requireAuth, requireCommunityAccount, requireRole("admin"), async (req, res, next) => {
	if (!validId(req.params.id)) return res.status(400).json({ message: "Message ID is invalid." });
	const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
	if (!body || body.length > 5000) return res.status(400).json({ message: "Enter a reply of up to 5,000 characters." });
	try {
		const [messages] = await db.execute(
			`SELECT m.subject,u.user_id managerId,u.display_name managerName,u.email managerEmail,s.society_name societyName
			FROM app_message m JOIN app_user u ON u.user_id=m.sender_user_id
			JOIN society s ON s.society_id=m.society_id
			WHERE m.message_id=? AND m.recipient_user_id=? AND m.society_id=?
				AND m.message_type IN ('manager_admin','event_invitation')
				AND u.role='manager' AND u.is_active=1 AND u.society_id=m.society_id
			LIMIT 1`,
			[Number(req.params.id), req.user.id, req.user.societyId]
		);
		if (!messages.length) return res.status(404).json({ message: "The manager message was not found in this society." });
		const original = messages[0];
		const subject = (original.subject.toLowerCase().startsWith("re:") ? original.subject : `Re: ${original.subject}`).slice(0, 180);
		await db.execute(
			"INSERT INTO app_message (society_id,sender_user_id,recipient_user_id,message_type,subject,body) VALUES (?,?,?,'admin_manager_reply',?,?)",
			[req.user.societyId, req.user.id, original.managerId, subject, body]
		);
		let emailSent = false;
		try {
			emailSent = await sendAdminReplyEmail({
				to: original.managerEmail,
				adminName: req.user.name,
				managerName: original.managerName,
				societyName: original.societyName,
				subject,
				body,
			});
		} catch (error) {
			console.error("Administrator-to-manager reply email failed:", error.message);
		}
		res.status(201).json({
			message: emailSent ? "Reply sent to the community manager and an email notification was sent." : "Reply saved for the community manager, but email notification could not be sent.",
			emailSent,
		});
	} catch (error) { next(error); }
});

router.patch("/messages/:id/read", requireAuth, requireCommunityAccount, async (req, res, next) => {
	if (req.user.role !== "manager") return res.status(403).json({ message: "Only community managers can update messages." });
	if (!validId(req.params.id)) return res.status(400).json({ message: "Message ID is invalid." });
	try {
		const [result] = await db.execute(
			"UPDATE app_message SET read_at=COALESCE(read_at,NOW()) WHERE message_id=? AND recipient_user_id=? AND society_id=?",
			[Number(req.params.id), req.user.id, req.user.societyId]
		);
		if (!result.affectedRows) return res.status(404).json({ message: "Message not found." });
		res.json({ message: "Message marked as read." });
	} catch (error) { next(error); }
});

router.post("/register", async (req, res) => {
	const { name, email, password, societyId, gender = null } = req.body || {};
	if (typeof name !== "string" || !name.trim() || name.trim().length > 120 || !validCredentials(email, password) ||
		!validId(societyId) || !validGender(gender)) {
		return res.status(400).json({ message: "Enter your name, a valid email, a password with at least 12 characters, and a community." });
	}
	if (rateLimited(req.ip || req.socket.remoteAddress || "unknown")) {
		return res.status(429).json({ message: "Too many requests. Try again in 15 minutes." });
	}
	try {
		await ensureAuthSchema();
		const [[society]] = await db.execute("SELECT society_id FROM society WHERE society_id=?", [Number(societyId)]);
		if (!society) return res.status(400).json({ message: "Choose an existing community." });
		const normalizedEmail = email.trim().toLowerCase();
		const [[account]] = await db.execute("SELECT user_id FROM app_user WHERE email=? LIMIT 1", [normalizedEmail]);
		if (account) return res.status(409).json({ message: "An account with that email already exists. Sign in or reset your password." });
		const [[request]] = await db.execute(
			"SELECT request_id FROM app_account_request WHERE email=? AND society_id=? AND status='pending' LIMIT 1",
			[normalizedEmail, Number(societyId)]
		);
		if (request) return res.status(409).json({ message: "A request for this email is already awaiting administrator approval." });
		await db.execute(
			"INSERT INTO app_account_request (society_id,display_name,email,password_hash,gender) VALUES (?,?,?,?,?)",
			[Number(societyId), name.trim(), normalizedEmail, hashPassword(password).encoded, gender]
		);
		res.status(202).json({ message: "Your request was sent. A community administrator must approve your account before you can sign in." });
	} catch (error) {
		console.error("Account request failed:", error.message);
		res.status(503).json({ message: "Could not submit your account request. Please try again later." });
	}
});

router.post("/forgot-password", async (req, res) => {
	const email = req.body?.email;
	if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
		return res.status(400).json({ message: "Enter a valid email address." });
	}
	const transport = mailTransport();
	if (!transport) return res.status(503).json({ message: "Password reset email is not configured. Contact your community administrator." });
	if (rateLimited(req.ip || req.socket.remoteAddress || "unknown")) {
		return res.status(429).json({ message: "Too many requests. Try again in 15 minutes." });
	}
	try {
		await ensureAuthSchema();
		const [users] = await db.execute("SELECT user_id id,email FROM app_user WHERE email=? AND is_active=1 LIMIT 1", [email.trim().toLowerCase()]);
		if (users.length) {
			const token = crypto.randomBytes(32).toString("base64url");
			const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
			const expiresAt = new Date(Date.now() + 30 * 60_000);
			await db.execute("DELETE FROM app_password_reset WHERE user_id=?", [users[0].id]);
			await db.execute("INSERT INTO app_password_reset (user_id,token_hash,expires_at) VALUES (?,?,?)", [users[0].id, tokenHash, expiresAt]);
			const link = `${frontendUrl()}/?resetToken=${encodeURIComponent(token)}`;
			await sendPasswordResetEmail(users[0].email, link);
		}
		res.json({ message: "If an active account matches that email, a password reset link has been sent." });
	} catch (error) {
		console.error("Password reset email failed:", error.message);
		res.status(503).json({ message: "Could not send a password reset email. Please try again later." });
	}
});

router.post("/reset-password", async (req, res) => {
	const { token, password } = req.body || {};
	if (typeof token !== "string" || token.length < 32 || typeof password !== "string" || password.length < 12 || password.length > 200) {
		return res.status(400).json({ message: "Use a valid reset link and a password with at least 12 characters." });
	}
	let connection;
	try {
		await ensureAuthSchema();
		const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
		connection = await db.getConnection();
		await connection.beginTransaction();
		const [resets] = await connection.execute(
			"SELECT reset_id,user_id FROM app_password_reset WHERE token_hash=? AND expires_at>NOW() FOR UPDATE",
			[tokenHash]
		);
		if (!resets.length) {
			await connection.rollback();
			return res.status(400).json({ message: "This password reset link is invalid or expired. Request a new one." });
		}
		await connection.execute("UPDATE app_user SET password_hash=? WHERE user_id=? AND is_active=1", [hashPassword(password).encoded, resets[0].user_id]);
		await connection.execute("DELETE FROM app_password_reset WHERE user_id=?", [resets[0].user_id]);
		await connection.execute("DELETE FROM app_session WHERE user_id=?", [resets[0].user_id]);
		await connection.commit();
		res.json({ message: "Password updated. You can now sign in." });
	} catch (error) {
		if (connection) await connection.rollback();
		console.error("Password reset failed:", error.message);
		res.status(503).json({ message: "Could not update your password. Please try again." });
	} finally {
		if (connection) connection.release();
	}
});

function beginOAuth(provider, authorizationEndpoint, scopes) {
	return (req, res) => {
		if (!providerConfigured(provider.toUpperCase())) return redirectAuthError(res, `${provider} sign-in is not configured yet. Ask your administrator to add the OAuth credentials.`);
		const state = crypto.randomBytes(32).toString("base64url");
		const verifier = crypto.randomBytes(48).toString("base64url");
		const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
		res.setHeader("Set-Cookie", [
			`nestora_oauth_state=${encodeURIComponent(state)}; ${oauthCookieOptions(600)}`,
			`nestora_oauth_verifier=${encodeURIComponent(verifier)}; ${oauthCookieOptions(600)}`,
		]);
		const url = new URL(authorizationEndpoint);
		url.search = new URLSearchParams({
			client_id: process.env[`${provider.toUpperCase()}_CLIENT_ID`],
			redirect_uri: callbackUrl(req, provider),
			response_type: "code",
			scope: scopes,
			state,
			code_challenge: challenge,
			code_challenge_method: "S256",
		}).toString();
		res.redirect(url.toString());
	};
}

async function oauthCallback(provider, req, res) {
	const state = req.query.state;
	const savedState = getCookie(req, "nestora_oauth_state");
	const verifier = getCookie(req, "nestora_oauth_verifier");
	const clearedOAuthCookies = [
		`nestora_oauth_state=; ${oauthCookieOptions(0)}`,
		`nestora_oauth_verifier=; ${oauthCookieOptions(0)}`,
	];
	res.setHeader("Set-Cookie", clearedOAuthCookies);
	if (typeof state !== "string" || !savedState || state !== savedState || !verifier) {
		return redirectAuthError(res, "Sign-in could not be verified. Please try again.");
	}
	if (typeof req.query.error === "string" || typeof req.query.code !== "string") {
		return redirectAuthError(res, "Sign-in was cancelled or could not be completed.");
	}
	if (!providerConfigured(provider.toUpperCase())) return redirectAuthError(res, `${provider} sign-in is not configured yet.`);
	const callback = callbackUrl(req, provider);
	const tokenUrl = "https://oauth2.googleapis.com/token";
	const form = new URLSearchParams({
		client_id: process.env.GOOGLE_CLIENT_ID,
		client_secret: process.env.GOOGLE_CLIENT_SECRET,
		code: req.query.code,
		redirect_uri: callback,
		grant_type: "authorization_code",
		code_verifier: verifier,
	});
	const tokenResponse = await fetch(tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: form,
	});
	const tokenData = await tokenResponse.json();
	if (!tokenResponse.ok || typeof tokenData.access_token !== "string") throw new Error("Identity provider token exchange failed.");
	const identityResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token || "")}`);
	const identity = await identityResponse.json();
	const verified = identityResponse.ok && identity.aud === process.env.GOOGLE_CLIENT_ID &&
		(identity.email_verified === "true" || identity.email_verified === true);
	const email = identity.email;
	if (!verified || typeof email !== "string") return redirectAuthError(res, "The provider did not return a verified email address.");
	await ensureAuthSchema();
	const [users] = await db.execute(
		"SELECT user_id id,role,resident_id residentId,society_id societyId FROM app_user WHERE email=? AND is_active=1 AND (role='admin' OR society_id IS NOT NULL) LIMIT 1",
		[email.trim().toLowerCase()]
	);
	if (!users.length || !validRoles.includes(users[0].role)) return redirectAuthError(res, "No approved Nestora account matches this email. Request access from your community administrator.");
	if (["resident", "tenant"].includes(users[0].role)) {
		const [linked] = await db.execute(
			"SELECT r.resident_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? AND r.is_active=1 LIMIT 1",
			[users[0].residentId, users[0].societyId]
		);
		if (!linked.length) return redirectAuthError(res, "No approved Nestora account matches this email.");
	}
	await createSession(res, users[0].id);
	res.setHeader("Set-Cookie", [...clearedOAuthCookies, res.getHeader("Set-Cookie")]);
	res.redirect(frontendUrl());
}

router.get("/google", beginOAuth("google", "https://accounts.google.com/o/oauth2/v2/auth", "openid email profile"));
router.get("/google/callback", (req, res) => void oauthCallback("google", req, res).catch((error) => {
	console.error("Google sign-in failed:", error.message);
	redirectAuthError(res, "Google sign-in could not be completed. Please try again.");
}));

router.post("/setup", async (req, res) => {
	const { name, email, password, gender = null } = req.body || {};
	const societyId = req.body?.societyId ? Number(req.body.societyId) : null;
	if (typeof name !== "string" || !name.trim() || !validCredentials(email, password) ||
		(societyId !== null && !validId(societyId)) || !validGender(gender)) {
		return res.status(400).json({ message: "Enter your name, a valid email, and a password with at least 12 characters." });
	}
	let connection;
	try {
		await ensureAuthSchema();
		connection = await db.getConnection();
		const [[lock]] = await connection.query("SELECT GET_LOCK('nestora_first_admin_setup', 5) acquired");
		if (Number(lock.acquired) !== 1) return res.status(503).json({ message: "First-time setup is busy. Try again." });
		const [[count]] = await connection.query("SELECT COUNT(*) count FROM app_user");
		if (Number(count.count) !== 0) return res.status(409).json({ message: "The administrator account is already set up. Sign in instead." });
		if (societyId !== null) {
			const [[society]] = await connection.execute("SELECT society_id FROM society WHERE society_id=?", [societyId]);
			if (!society) return res.status(400).json({ message: "Choose an existing community." });
		}
		const passwordHash = hashPassword(password).encoded;
		const [result] = await connection.execute(
			"INSERT INTO app_user (society_id,display_name,email,password_hash,role,gender) VALUES (?,?,?,?,'admin',?)",
			[societyId, name.trim(), email.trim().toLowerCase(), passwordHash, gender]
		);
		await createSession(res, result.insertId);
		res.status(201).json({ user: { id: result.insertId, societyId, name: name.trim(), email: email.trim().toLowerCase(), role: "admin", gender, managerPermissions: {} } });
	} catch (error) {
		console.error("Admin setup failed:", error.message);
		res.status(error.code === "ER_DUP_ENTRY" ? 409 : 503).json({ message: error.code === "ER_DUP_ENTRY" ? "That email is already registered." : "Could not create the administrator account." });
	} finally {
		if (connection) {
			try { await connection.query("SELECT RELEASE_LOCK('nestora_first_admin_setup')"); } catch {}
			connection.release();
		}
	}
});

router.post("/login", async (req, res) => {
	const { email, password } = req.body || {};
	if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ message: "Enter your email and password." });
	if (rateLimited(req.ip || req.socket.remoteAddress || "unknown")) return res.status(429).json({ message: "Too many sign-in attempts. Try again in 15 minutes." });
	try {
		await ensureAuthSchema();
		const [users] = await db.execute(
			"SELECT user_id id,society_id societyId,display_name name,email,password_hash passwordHash,role,gender,resident_id residentId,tenant_id tenantId,manager_permissions managerPermissions FROM app_user WHERE email=? AND is_active=1 AND (role='admin' OR society_id IS NOT NULL) AND role IN ('admin','manager','resident','tenant','security') LIMIT 1",
			[email.trim().toLowerCase()]
		);
		if (!users.length || !verifyPassword(password, users[0].passwordHash)) return res.status(401).json({ message: "Email or password is incorrect." });
		if (["resident", "tenant"].includes(users[0].role)) {
			const [linked] = await db.execute(
				"SELECT r.resident_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? AND r.is_active=1 LIMIT 1",
				[users[0].residentId, users[0].societyId]
			);
			if (!linked.length) return res.status(401).json({ message: "Email or password is incorrect." });
		}
		await createSession(res, users[0].id);
		const { passwordHash, ...user } = users[0];
		void passwordHash;
		user.managerPermissions = parseManagerPermissions(user.managerPermissions);
		res.json({ user });
	} catch (error) {
		console.error("Login failed:", error.message);
		res.status(503).json({ message: "Sign-in is temporarily unavailable." });
	}
});

router.get("/session", async (req, res) => {
	try {
		await ensureAuthSchema();
		const user = await currentUser(req);
		if (!user) return res.status(401).json({ message: "Sign in to continue." });
		res.json({ user });
	} catch (error) {
		console.error("Session lookup failed:", error.message);
		res.status(503).json({ message: "Authentication storage is unavailable." });
	}
});

router.post("/logout", async (req, res) => {
	try {
		const token = getCookie(req, "nestora_session");
		if (token) await db.execute("DELETE FROM app_session WHERE token_hash=?", [crypto.createHash("sha256").update(token).digest("hex")]);
		res.setHeader("Set-Cookie", `nestora_session=; ${cookieOptions(0)}`);
		res.json({ message: "Signed out." });
	} catch (error) {
		console.error("Sign-out failed:", error.message);
		res.status(503).json({ message: "Could not complete sign-out." });
	}
});

router.get("/requests", requireAuth, requireRole("manager"), requireManagerPermission("users", "view"), async (req, res, next) => {
	try {
		const [rows] = await db.execute(
			"SELECT request_id id,display_name name,email,gender,created_at createdAt FROM app_account_request WHERE society_id=? AND status='pending' ORDER BY created_at",
			[req.user.societyId]
		);
		res.json(rows);
	} catch (error) { next(error); }
});

router.post("/requests/:id/approve", requireAuth, requireRole("manager"), requireManagerPermission("users", "add"), async (req, res, next) => {
	const { role, residentId = null } = req.body || {};
	if (!validId(req.params.id) || !["resident", "security"].includes(role) ||
		(role === "resident" && !validId(residentId)) || (role !== "resident" && residentId !== null && residentId !== "")) {
		return res.status(400).json({ message: "Choose an allowed role and link an active resident when approving a resident account." });
	}
	let connection;
	try {
		connection = await db.getConnection();
		await connection.beginTransaction();
		const [requests] = await connection.execute(
			"SELECT request_id id,display_name name,email,password_hash passwordHash,gender FROM app_account_request WHERE request_id=? AND society_id=? AND status='pending' FOR UPDATE",
			[Number(req.params.id), req.user.societyId]
		);
		if (!requests.length) {
			await connection.rollback();
			return res.status(404).json({ message: "This account request is no longer pending." });
		}
		const request = requests[0];
		const [existing] = await connection.execute("SELECT user_id FROM app_user WHERE email=? LIMIT 1", [request.email]);
		if (existing.length) {
			await connection.rollback();
			return res.status(409).json({ message: "An account with this email already exists." });
		}
		if (role === "resident") {
			const [residents] = await connection.execute(
				"SELECT r.resident_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? AND r.is_active=1 LIMIT 1",
				[Number(residentId), req.user.societyId]
			);
			if (!residents.length) {
				await connection.rollback();
				return res.status(400).json({ message: "Choose an active resident in your community." });
			}
			const [linked] = await connection.execute("SELECT user_id FROM app_user WHERE resident_id=? AND is_active=1 LIMIT 1", [Number(residentId)]);
			if (linked.length) {
				await connection.rollback();
				return res.status(409).json({ message: "That resident already has an active account." });
			}
		}
		await connection.execute(
			"INSERT INTO app_user (society_id,display_name,email,password_hash,role,gender,resident_id) VALUES (?,?,?,?,?,?,?)",
			[req.user.societyId, request.name, request.email, request.passwordHash, role, request.gender, role === "resident" ? Number(residentId) : null]
		);
		await connection.execute("UPDATE app_account_request SET status='approved',password_hash='' WHERE request_id=?", [request.id]);
		await connection.commit();
		res.status(201).json({ message: "Account request approved." });
	} catch (error) {
		if (connection) await connection.rollback();
		next(error);
	} finally { if (connection) connection.release(); }
});

router.post("/requests/:id/reject", requireAuth, requireRole("manager"), requireManagerPermission("users", "add"), async (req, res, next) => {
	if (!validId(req.params.id)) return res.status(400).json({ message: "Request ID is invalid." });
	try {
		const [result] = await db.execute(
			"UPDATE app_account_request SET status='rejected',password_hash='' WHERE request_id=? AND society_id=? AND status='pending'",
			[Number(req.params.id), req.user.societyId]
		);
		if (!result.affectedRows) return res.status(404).json({ message: "This account request is no longer pending." });
		res.json({ message: "Account request rejected." });
	} catch (error) { next(error); }
});

router.get("/users", requireAuth, requireRole("manager"), requireManagerPermission("users", "view"), async (req, res, next) => {
	try {
		const [rows] = await db.execute(
			"SELECT user_id id,display_name name,email,role,gender,resident_id residentId,is_active active,created_at createdAt FROM app_user WHERE society_id=? AND role IN ('admin','manager','resident','tenant','security') ORDER BY created_at DESC",
			[req.user.societyId]
		);
		res.json(rows);
	} catch (error) { next(error); }
});

router.post("/users", requireAuth, requireRole("manager"), requireManagerPermission("users", "add"), async (req, res, next) => {
	const { name, email, password, role, residentId = null, gender = null } = req.body || {};
	if (req.user.role === "manager" && !["security", "resident"].includes(role)) {
		return res.status(403).json({ message: "Managers can create Security and Resident accounts only." });
	}
	if (typeof name !== "string" || !name.trim() || !validCredentials(email, password) || !validRoles.includes(role) ||
		(role === "resident" && !validId(residentId)) || (role !== "resident" && residentId !== null && residentId !== "") || !validGender(gender)) {
		return res.status(400).json({ message: "Enter a name, valid email, 12-character password, permitted role, and resident link when creating a resident account." });
	}
	try {
		if (role === "resident") {
			const [residents] = await db.execute(
				"SELECT r.resident_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? AND r.is_active=1 LIMIT 1",
				[Number(residentId), req.user.societyId]
			);
			if (!residents.length) return res.status(400).json({ message: "Choose an active resident in your community." });
			const [linked] = await db.execute("SELECT user_id FROM app_user WHERE resident_id=? AND is_active=1 LIMIT 1", [Number(residentId)]);
			if (linked.length) return res.status(409).json({ message: "That resident already has an active account." });
		}
		const [result] = await db.execute(
			"INSERT INTO app_user (society_id,display_name,email,password_hash,role,gender,resident_id) VALUES (?,?,?,?,?,?,?)",
			[req.user.societyId, name.trim(), email.trim().toLowerCase(), hashPassword(password).encoded, role, gender, role === "resident" ? Number(residentId) : null]
		);
		res.status(201).json({ id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role, gender, residentId: role === "resident" ? Number(residentId) : null, active: true });
	} catch (error) { next(error); }
});

router.patch("/users/:id", requireAuth, requireRole("manager"), requireManagerPermission("users", "edit"), async (req, res, next) => {
	if (!validId(req.params.id)) return res.status(400).json({ message: "Account ID is invalid." });
	if (req.user.id === Number(req.params.id)) return res.status(400).json({ message: "You cannot deactivate your own account." });
	const active = req.body?.active;
	if (typeof active !== "boolean") return res.status(400).json({ message: "Specify active as true or false." });
	let connection;
	try {
		connection = await db.getConnection();
		await connection.beginTransaction();
		await connection.execute("SELECT society_id FROM society WHERE society_id=? FOR UPDATE", [req.user.societyId]);
		const [targets] = await connection.execute("SELECT user_id,role FROM app_user WHERE user_id=? AND society_id=? FOR UPDATE", [Number(req.params.id), req.user.societyId]);
		if (!targets.length) { await connection.rollback(); return res.status(404).json({ message: "Account not found." }); }
		if (!["resident", "security"].includes(targets[0].role)) {
			await connection.rollback();
			return res.status(403).json({ message: "Managers can only change Resident and Security accounts." });
		}
		await connection.execute("UPDATE app_user SET is_active=? WHERE user_id=? AND society_id=?", [active ? 1 : 0, Number(req.params.id), req.user.societyId]);
		if (!active) await connection.execute("DELETE FROM app_session WHERE user_id=?", [Number(req.params.id)]);
		await connection.commit();
		res.json({ message: active ? "Account activated." : "Account deactivated." });
	} catch (error) {
		if (connection) await connection.rollback();
		next(error);
	} finally { if (connection) connection.release(); }
});

module.exports = router;
