const crypto = require("crypto");
const db = require("./db");

const managerPermissionModules = [
	"dashboard", "residents", "flats", "amenities", "bookings", "maintenance",
	"payments", "complaints", "vehicles", "visitors", "notices", "reports", "tenants", "users",
];
const managerPermissionActions = ["view", "add", "edit", "delete"];

let schemaReady;
function ensureAuthSchema() {
	if (!schemaReady) {
		schemaReady = (async () => {
			await db.query(`CREATE TABLE IF NOT EXISTS app_user (
				user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				society_id INT NULL,
				display_name VARCHAR(120) NOT NULL,
				email VARCHAR(190) NOT NULL UNIQUE,
				password_hash VARCHAR(255) NOT NULL,
				role VARCHAR(24) NOT NULL DEFAULT 'resident',
				gender VARCHAR(16) NULL,
				resident_id BIGINT UNSIGNED NULL,
				is_active TINYINT(1) NOT NULL DEFAULT 1,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`);
			const [userColumns] = await db.query("SHOW COLUMNS FROM app_user LIKE 'gender'");
			if (!userColumns.length) await db.query("ALTER TABLE app_user ADD COLUMN gender VARCHAR(16) NULL");
			const [permissionColumns] = await db.query("SHOW COLUMNS FROM app_user LIKE 'manager_permissions'");
			if (!permissionColumns.length) await db.query("ALTER TABLE app_user ADD COLUMN manager_permissions LONGTEXT NULL");
			const [tenantColumns] = await db.query("SHOW COLUMNS FROM app_user LIKE 'tenant_id'");
			if (!tenantColumns.length) await db.query("ALTER TABLE app_user ADD COLUMN tenant_id BIGINT UNSIGNED NULL");
			await db.query(`CREATE TABLE IF NOT EXISTS app_session (
				session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				user_id BIGINT UNSIGNED NOT NULL,
				token_hash CHAR(64) NOT NULL UNIQUE,
				expires_at DATETIME NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				KEY idx_app_session_expiry (expires_at)
			)`);
			await db.query(`CREATE TABLE IF NOT EXISTS app_account_request (
				request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				society_id INT NOT NULL,
				display_name VARCHAR(120) NOT NULL,
				email VARCHAR(190) NOT NULL,
				password_hash VARCHAR(255) NOT NULL,
				gender VARCHAR(16) NULL,
				status VARCHAR(16) NOT NULL DEFAULT 'pending',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				KEY idx_account_request_society (society_id,status,created_at)
			)`);
			await db.query(`CREATE TABLE IF NOT EXISTS app_password_reset (
				reset_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				user_id BIGINT UNSIGNED NOT NULL,
				token_hash CHAR(64) NOT NULL UNIQUE,
				expires_at DATETIME NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				KEY idx_password_reset_expiry (expires_at)
			)`);
			await db.query(`CREATE TABLE IF NOT EXISTS community_tenant (
				tenant_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				resident_id BIGINT UNSIGNED NOT NULL UNIQUE,
				society_id INT NOT NULL,
				created_by BIGINT UNSIGNED NOT NULL,
				move_in DATE NOT NULL,
				move_out DATE NULL,
				emergency_contact VARCHAR(30) NULL,
				id_proof_path VARCHAR(255) NULL,
				family_members SMALLINT UNSIGNED NULL,
				vehicle_registration VARCHAR(32) NULL,
				status VARCHAR(24) NOT NULL DEFAULT 'Active',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				KEY idx_tenant_society_status (society_id,status,created_at)
			)`);
			await db.query(`CREATE TABLE IF NOT EXISTS app_message (
				message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				society_id INT NOT NULL,
				sender_user_id BIGINT UNSIGNED NOT NULL,
				recipient_user_id BIGINT UNSIGNED NOT NULL,
				message_type VARCHAR(24) NOT NULL,
				subject VARCHAR(180) NOT NULL,
				body TEXT NOT NULL,
				read_at DATETIME NULL,
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				KEY idx_app_message_recipient (recipient_user_id,read_at,created_at),
				KEY idx_app_message_society (society_id,message_type,created_at)
			)`);
			const [eventAtColumns] = await db.query("SHOW COLUMNS FROM app_message LIKE 'event_at'");
			if (!eventAtColumns.length) await db.query("ALTER TABLE app_message ADD COLUMN event_at DATETIME NULL");
			const [eventLocationColumns] = await db.query("SHOW COLUMNS FROM app_message LIKE 'event_location'");
			if (!eventLocationColumns.length) await db.query("ALTER TABLE app_message ADD COLUMN event_location VARCHAR(180) NULL");
		})().catch((error) => { schemaReady = undefined; throw error; });
	}
	return schemaReady;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
	const derived = crypto.scryptSync(password, salt, 64).toString("hex");
	return { salt, derived, encoded: `${salt}:${derived}` };
}

function verifyPassword(password, encoded) {
	const [salt, expectedHex] = String(encoded).split(":");
	if (!salt || !expectedHex) return false;
	const actual = Buffer.from(hashPassword(password, salt).derived, "hex");
	const expected = Buffer.from(expectedHex, "hex");
	return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function cookieOptions(maxAge) {
	return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function getCookie(req, name) {
	const found = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
	return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

function parseManagerPermissions(value) {
	if (!value) return {};
	let permissions = value;
	if (typeof value === "string") {
		try { permissions = JSON.parse(value); }
		catch { return {}; }
	}
	if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) return {};
	return permissions;
}

async function createSession(res, userId) {
	await db.execute("DELETE FROM app_session WHERE expires_at < NOW()");
	const token = crypto.randomBytes(32).toString("base64url");
	const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
	const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
	await db.execute("INSERT INTO app_session (user_id, token_hash, expires_at) VALUES (?, ?, ?)", [userId, tokenHash, expiresAt]);
	res.setHeader("Set-Cookie", `nestora_session=${encodeURIComponent(token)}; ${cookieOptions(12 * 60 * 60)}`);
}

async function currentUser(req) {
	const token = getCookie(req, "nestora_session");
	if (!token) return null;
	const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
	const [rows] = await db.execute(`SELECT u.user_id AS id, u.society_id AS societyId,
			sc.society_name AS societyName, u.display_name AS name, u.email, u.role, u.gender,
			u.resident_id AS residentId, u.tenant_id AS tenantId, u.manager_permissions AS managerPermissions
		FROM app_session sess JOIN app_user u ON u.user_id = sess.user_id
		LEFT JOIN society sc ON sc.society_id = u.society_id
		LEFT JOIN resident r ON r.resident_id = u.resident_id AND r.is_active = 1
		LEFT JOIN flat f ON f.flat_id = r.flat_id AND f.society_id = u.society_id
		LEFT JOIN community_tenant t ON t.tenant_id = u.tenant_id AND t.resident_id = u.resident_id
		WHERE sess.token_hash = ? AND sess.expires_at > NOW() AND u.is_active = 1
			AND (u.role = 'admin' OR u.society_id IS NOT NULL)
			AND u.role IN ('admin','manager','resident','tenant','security')
			AND (u.role NOT IN ('resident','tenant') OR (r.resident_id IS NOT NULL AND f.flat_id IS NOT NULL))
			AND (u.role <> 'tenant' OR (t.tenant_id IS NOT NULL AND t.status = 'Active'))
		LIMIT 1`, [tokenHash]);
	if (!rows[0]) return null;
	return { ...rows[0], managerPermissions: parseManagerPermissions(rows[0].managerPermissions) };
}

async function requireAuth(req, res, next) {
	try {
		await ensureAuthSchema();
		req.user = await currentUser(req);
		if (!req.user) return res.status(401).json({ message: "Sign in to continue." });
		return next();
	} catch (error) {
		console.error("Authentication check failed:", error.message);
		return res.status(503).json({ message: "Authentication storage is unavailable." });
	}
}

function requireRole(...roles) {
	return (req, res, next) => (roles.includes(req.user?.role) ||
		(req.user?.role === "tenant" && roles.includes("resident")))
		? next()
		: res.status(403).json({ message: "Your account does not have permission for this action." });
}

async function requireCommunityAccount(req, res, next) {
	if (req.user?.role !== "admin") return next();
	const societyId = Number(req.get("X-Society-ID"));
	if (!Number.isSafeInteger(societyId) || societyId < 1) {
		return res.status(400).json({ message: "Select a society to open its community workspace." });
	}
	try {
		const [societies] = await db.execute("SELECT society_id,society_name FROM society WHERE society_id=? LIMIT 1", [societyId]);
		if (!societies.length) return res.status(400).json({ message: "Select an existing society." });
		req.user.societyId = societies[0].society_id;
		req.user.societyName = societies[0].society_name;
		return next();
	} catch (error) {
		console.error("Administrator society lookup failed:", error.message);
		return res.status(503).json({ message: "Could not load the selected society." });
	}
}

function requireManagerPermission(moduleName, action) {
	return (req, res, next) => {
		if (req.user?.role === "admin") {
			if (action === "view") return next();
			return res.status(403).json({ message: "Platform administrators have read-only access to community modules." });
		}
		if (req.user?.role !== "manager") return next();
		const permissions = parseManagerPermissions(req.user.managerPermissions);
		if (permissions[moduleName]?.[action] === true) return next();
		return res.status(403).json({ message: `Your manager account does not have permission to ${action} ${moduleName}.` });
	};
}

module.exports = {
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
};
