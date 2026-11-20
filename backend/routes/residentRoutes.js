const express = require("express");
const db = require("../db");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { requireAuth, requireRole, requireCommunityAccount, requireManagerPermission, hashPassword } = require("../auth");
const { sendTenantWelcomeEmail, sendResidentTenantAddedEmail } = require("../mailer");

const router = express.Router();
router.use(requireAuth, requireCommunityAccount);
const proofDirectory = path.join(__dirname, "..", "private", "tenant-proofs");
const proofExtensions = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };
const tenantProofUpload = multer({
	storage: multer.diskStorage({
		destination(_req, _file, callback) {
			fs.mkdir(proofDirectory, { recursive: true }, (error) => callback(error, proofDirectory));
		},
		filename(_req, file, callback) {
			callback(null, `${crypto.randomUUID()}${proofExtensions[file.mimetype] || ""}`);
		},
	}),
	limits: { fileSize: 5 * 1024 * 1024, files: 1 },
	fileFilter(_req, file, callback) {
		if (!proofExtensions[file.mimetype]) return callback(new Error("ID proof must be a PDF, JPG, or PNG file."));
		return callback(null, true);
	},
});

function uploadTenantProof(req, res, next) {
	tenantProofUpload.single("idProof")(req, res, (error) => {
		if (error) return res.status(400).json({ message: error.message || "Could not upload the tenant ID proof." });
		return next();
	});
}

function validDate(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function removeUploadedProof(file) {
	if (file?.path) fs.unlink(file.path, (error) => {
		if (error && error.code !== "ENOENT") console.error("Could not remove rejected tenant ID proof:", error.message);
	});
}

router.get("/tenant-options", requireRole("resident"), async (req, res, next) => {
	try {
		const [flats] = await db.execute(
			`SELECT f.flat_id id,f.flat_number flat,CONCAT('Block ',f.block) block
			FROM resident r JOIN flat f ON f.flat_id=r.flat_id
			WHERE r.resident_id=? AND r.is_active=1 AND f.society_id=?`,
			[req.user.residentId, req.user.societyId]
		);
		res.json(flats);
	} catch (error) { next(error); }
});

function validEmail(value) {
	return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validPhone(value) {
	return typeof value === "string" && /^[+\d][\d\s()-]{5,19}$/.test(value.trim());
}

function validId(value) {
	return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

router.get("/", requireRole("admin", "manager", "resident"), requireManagerPermission("residents", "view"), async (req, res, next) => {
	try {
		const isResident = ["resident", "tenant"].includes(req.user.role);
		const [residents] = await db.execute(
			`SELECT r.resident_id AS id, r.full_name AS name, r.email, r.phone,
				f.flat_number AS flat, CONCAT('Block ', f.block) AS block,
				COALESCE(r.resident_type, 'Owner') AS status, r.is_active AS active,
				f.floor_number AS floor, f.flat_type AS flatType
			FROM resident r JOIN flat f ON f.flat_id = r.flat_id
			WHERE f.society_id = ? AND r.is_active = 1${isResident ? " AND r.resident_id = ?" : ""}
			ORDER BY r.resident_id DESC`,
			isResident ? [req.user.societyId, req.user.residentId] : [req.user.societyId]
		);
		res.json(residents);
	} catch (error) {
		next(error);
	}
});

router.get("/tenants", requireRole("admin", "manager", "resident", "tenant"), requireManagerPermission("tenants", "view"), async (req, res, next) => {
	try {
		const ownTenantFilter = req.user.role === "resident"
			? " AND t.created_by=?"
			: req.user.role === "tenant" ? " AND t.resident_id=?" : "";
		const parameters = req.user.role === "resident"
			? [req.user.societyId, req.user.id]
			: req.user.role === "tenant" ? [req.user.societyId, req.user.residentId] : [req.user.societyId];
		const [rows] = await db.execute(
			`SELECT t.tenant_id id,r.full_name name,r.email,r.phone,f.flat_number flat,CONCAT('Block ',f.block) block,
				t.move_in moveIn,t.move_out moveOut,t.emergency_contact emergencyContact,
				t.family_members familyMembers,t.vehicle_registration vehicleRegistration,t.status,
				(t.id_proof_path IS NOT NULL) idProofAvailable,r.resident_type residentType
			FROM community_tenant t JOIN resident r ON r.resident_id=t.resident_id
			JOIN flat f ON f.flat_id=r.flat_id AND f.society_id=t.society_id
			WHERE t.society_id=?${ownTenantFilter}
			ORDER BY t.created_at DESC,t.tenant_id DESC`,
			parameters
		);
		res.json(rows);
	} catch (error) { next(error); }
});

router.post("/tenants", requireRole("resident"), (req, res, next) => {
	if (req.user.role !== "resident") return res.status(403).json({ message: "Only a resident can add a tenant for their flat." });
	return next();
}, uploadTenantProof, async (req, res, next) => {
	const {
		name, email, phone, flatId, moveIn, moveOut = "", emergencyContact = "",
		familyMembers = "", vehicleRegistration = "", status = "Active",
	} = req.body || {};
	const familyCount = familyMembers === "" ? null : Number(familyMembers);
	const selectedFlatId = Number(flatId);
	const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
	if (typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
		!validEmail(normalizedEmail) || !validPhone(phone) || !validId(selectedFlatId) || !validDate(moveIn) ||
		(moveOut !== "" && (!validDate(moveOut) || moveOut < moveIn)) ||
		(emergencyContact !== "" && !validPhone(emergencyContact)) ||
		(familyCount !== null && (!Number.isInteger(familyCount) || familyCount < 1 || familyCount > 100)) ||
		(typeof vehicleRegistration !== "string" || vehicleRegistration.length > 32) ||
		!["Active", "Moved Out"].includes(status)) {
		removeUploadedProof(req.file);
		return res.status(400).json({ message: "Check the tenant details, dates, contact numbers, family count, and status." });
	}

	let connection;
	let tenantId;
	let resetToken;
	let managerNotified = false;
	let societyName;
	let residentName;
	let tenantFlat;
	let tenantBlock;
	try {
		connection = await db.getConnection();
		await connection.beginTransaction();
		const [residents] = await connection.execute(
			`SELECT r.resident_id residentId,r.flat_id flatId,r.full_name residentName,
				f.flat_number flat,f.block,s.society_name societyName
			FROM resident r JOIN flat f ON f.flat_id=r.flat_id
			JOIN society s ON s.society_id=f.society_id
			WHERE r.resident_id=? AND f.society_id=? AND f.flat_id=? AND r.is_active=1 FOR UPDATE`,
			[req.user.residentId, req.user.societyId, selectedFlatId]
		);
		if (!residents.length) {
			await connection.rollback();
			removeUploadedProof(req.file);
			return res.status(403).json({ message: "Your active flat assignment could not be verified." });
		}
		const [existing] = await connection.execute("SELECT user_id FROM app_user WHERE email=? LIMIT 1", [normalizedEmail]);
		if (existing.length) {
			await connection.rollback();
			removeUploadedProof(req.file);
			return res.status(409).json({ message: "An account with this email already exists." });
		}
		const resident = residents[0];
		tenantFlat = resident.flat;
		tenantBlock = resident.block;
		societyName = resident.societyName;
		residentName = resident.residentName;
		const [residentResult] = await connection.execute(
			"INSERT INTO resident (flat_id,full_name,email,phone,resident_type,is_active) VALUES (?,?,?,?,?,?)",
			[resident.flatId, name.trim(), normalizedEmail, phone.trim(), "Tenant", status === "Active" ? 1 : 0]
		);
		const residentId = residentResult.insertId;
		const [tenantResult] = await connection.execute(
			`INSERT INTO community_tenant
				(resident_id,society_id,created_by,move_in,move_out,emergency_contact,id_proof_path,family_members,vehicle_registration,status)
			VALUES (?,?,?,?,?,?,?,?,?,?)`,
			[residentId, req.user.societyId, req.user.id, moveIn, moveOut || null, emergencyContact.trim() || null,
				req.file?.filename || null, familyCount, vehicleRegistration.trim() || null, status]
		);
		tenantId = tenantResult.insertId;
		const initialPassword = crypto.randomBytes(32).toString("base64url");
		const [accountResult] = await connection.execute(
			`INSERT INTO app_user (society_id,display_name,email,password_hash,role,resident_id,tenant_id,is_active)
			VALUES (?,?,?,?, 'tenant',?,?,?)`,
			[req.user.societyId, name.trim(), normalizedEmail, hashPassword(initialPassword).encoded, residentId, tenantId, status === "Active" ? 1 : 0]
		);
		if (status === "Active") {
			resetToken = crypto.randomBytes(32).toString("base64url");
			const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
			await connection.execute(
				"INSERT INTO app_password_reset (user_id,token_hash,expires_at) VALUES (?,?,?)",
				[accountResult.insertId, tokenHash, new Date(Date.now() + 30 * 60_000)]
			);
		}
		const [managers] = await connection.execute(
			"SELECT user_id FROM app_user WHERE society_id=? AND role='manager' AND is_active=1",
			[req.user.societyId]
		);
		const subject = `Tenant added: ${name.trim()} · ${resident.block}-${resident.flat}`;
		const body = [
			`${name.trim()} was added by ${req.user.name}.`,
			`Flat: Block ${resident.block}, ${resident.flat}`,
			`Email: ${normalizedEmail}`,
			`Phone: ${phone.trim()}`,
			`Move-in: ${moveIn}`,
			`Move-out: ${moveOut || "Not specified"}`,
			`Emergency contact: ${emergencyContact.trim() || "Not specified"}`,
			`Family members: ${familyCount ?? "Not specified"}`,
			`Vehicle registration: ${vehicleRegistration.trim() || "Not specified"}`,
			`Status: ${status}`,
			`ID proof attached: ${req.file ? "Yes" : "No"}`,
		].join("\n");
		for (const manager of managers) {
			await connection.execute(
				"INSERT INTO app_message (society_id,sender_user_id,recipient_user_id,message_type,subject,body) VALUES (?,?,?,'tenant_added',?,?)",
				[req.user.societyId, req.user.id, manager.user_id, subject, body]
			);
		}
		managerNotified = managers.length > 0;
		await connection.commit();
	} catch (error) {
		if (connection) await connection.rollback();
		removeUploadedProof(req.file);
		return next(error);
	} finally {
		if (connection) connection.release();
	}

	let tenantEmailSent = false;
	let residentEmailSent = false;
	const frontend = (process.env.FRONTEND_URL || (process.env.FRONTEND_ORIGINS || "http://localhost:5174").split(",")[0].trim()).replace(/\/$/, "");
	if (resetToken) {
		try {
			const setupLink = `${frontend}/?resetToken=${encodeURIComponent(resetToken)}`;
			tenantEmailSent = await sendTenantWelcomeEmail({
				to: normalizedEmail,
				tenantName: name.trim(),
				societyName,
				block: `Block ${tenantBlock}`,
				flat: tenantFlat,
				setupLink,
			});
		} catch (error) {
			console.error("Tenant welcome email failed:", error.message);
		}
	}
	try {
		residentEmailSent = await sendResidentTenantAddedEmail({
			to: req.user.email,
			residentName,
			tenantName: name.trim(),
			tenantEmail: normalizedEmail,
			tenantPhone: phone.trim(),
			societyName,
			block: `Block ${tenantBlock}`,
			flat: tenantFlat,
			moveIn,
			moveOut,
			emergencyContact: emergencyContact.trim(),
			familyMembers: familyCount,
			vehicleRegistration: vehicleRegistration.trim(),
			status,
		});
	} catch (error) {
		console.error("Resident tenant notification email failed:", error.message);
	}
	const emailWarnings = [];
	if (status === "Active" && !tenantEmailSent) emailWarnings.push("the tenant welcome email could not be sent");
	if (!residentEmailSent) emailWarnings.push("the resident notification email could not be sent");
	const emailMessage = emailWarnings.length
		? ` Check mail settings; ${emailWarnings.join(" and ")}.`
		: status === "Active"
			? " Tenant and resident emails were sent."
			: " The resident notification email was sent.";
	res.status(201).json({
		id: tenantId,
		name: name.trim(),
		email: normalizedEmail,
		flat: tenantFlat,
		block: `Block ${tenantBlock}`,
		status,
		managerNotified,
		tenantEmailSent,
		residentEmailSent,
		setupEmailSent: tenantEmailSent,
		message: `Tenant added${managerNotified ? " and society managers notified" : ""}.${status !== "Active" ? " No account setup link was sent because the tenant is marked as moved out." : ""}${emailMessage}`,
	});
});

router.get("/tenants/:id/proof", requireRole("admin", "manager", "resident", "tenant"), requireManagerPermission("tenants", "view"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ message: "Tenant ID is invalid." });
	try {
		const [rows] = await db.execute(
			`SELECT t.id_proof_path proofPath,t.resident_id residentId,t.society_id societyId,t.created_by createdBy
			FROM community_tenant t WHERE t.tenant_id=? AND t.society_id=?`,
			[Number(req.params.id), req.user.societyId]
		);
		if (!rows.length) return res.status(404).json({ message: "Tenant record not found." });
		const proof = rows[0];
		if (["resident", "tenant"].includes(req.user.role) &&
			(req.user.role === "tenant"
				? String(req.user.residentId) !== String(proof.residentId)
				: String(req.user.id) !== String(proof.createdBy))) {
			return res.status(403).json({ message: "You cannot access this tenant document." });
		}
		if (!proof.proofPath) return res.status(404).json({ message: "No ID proof was uploaded for this tenant." });
		const proofPath = path.resolve(proofDirectory, path.basename(proof.proofPath));
		res.download(proofPath, `tenant-${req.params.id}-id-proof`, { dotfiles: "deny" }, (error) => {
			if (error && !res.headersSent) next(error);
		});
	} catch (error) { next(error); }
});

router.post("/", requireRole("admin", "manager"), requireManagerPermission("residents", "add"), async (req, res, next) => {
	const { name, email, phone, flat } = req.body ?? {};
	const block = req.body?.block;
	if (typeof name !== "string" || !name.trim() || !validEmail(email) || !validPhone(phone) ||
		typeof flat !== "string" || !flat.trim() || typeof block !== "string" || !block.trim()) {
		return res.status(400).json({ message: "Enter a name, valid email and phone, and flat assignment." });
	}
	const blockCode = block.replace(/^Block\s+/i, "").trim();
	const residentType = typeof req.body?.residentType === "string" && req.body.residentType.trim()
		? req.body.residentType.trim() : "Owner";
	try {
		const [flats] = await db.execute(
			"SELECT flat_id,flat_number,block FROM flat WHERE society_id=? AND flat_number=? AND block=? LIMIT 1",
			[req.user.societyId, flat.trim(), blockCode]
		);
		if (!flats.length) return res.status(400).json({ message: "That flat does not exist in your community." });
		const [result] = await db.execute(
			"INSERT INTO resident (flat_id,full_name,email,phone,resident_type,is_active) VALUES (?,?,?,?,?,1)",
			[flats[0].flat_id, name.trim(), email.trim().toLowerCase(), phone.trim(), residentType]
		);
		res.status(201).json({ id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), flat: flats[0].flat_number, block: `Block ${flats[0].block}`, status: residentType, active: true });
	} catch (error) {
		next(error);
	}
});

router.patch("/:id", requireRole("admin", "manager"), requireManagerPermission("residents", "edit"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: "Resident ID is invalid." });
	const { name, email, phone, flat, block, residentType, active } = req.body || {};
	if ((name !== undefined && (typeof name !== "string" || !name.trim())) ||
		(email !== undefined && !validEmail(email)) || (phone !== undefined && !validPhone(phone)) ||
		(active !== undefined && typeof active !== "boolean") ||
		((flat !== undefined || block !== undefined) && (typeof flat !== "string" || !flat.trim() || typeof block !== "string" || !block.trim()))) {
		return res.status(400).json({ message: "Check the resident details and try again." });
	}
	let connection;
	try {
		connection = await db.getConnection();
		await connection.beginTransaction();
		const [rows] = await connection.execute(
			"SELECT r.resident_id,r.flat_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? FOR UPDATE",
			[Number(req.params.id), req.user.societyId]
		);
		if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: "Resident not found." }); }
		let flatId = rows[0].flat_id;
		if (flat !== undefined) {
			const blockCode = block.replace(/^Block\s+/i, "").trim();
			const [flats] = await connection.execute("SELECT flat_id FROM flat WHERE society_id=? AND flat_number=? AND block=? LIMIT 1", [req.user.societyId, flat.trim(), blockCode]);
			if (!flats.length) { await connection.rollback(); return res.status(400).json({ message: "That flat does not exist in your community." }); }
			flatId = flats[0].flat_id;
		}
		const fields = [];
		const values = [];
		for (const [key, value] of [["full_name", name], ["email", email], ["phone", phone], ["resident_type", residentType]]) {
			if (value !== undefined) { fields.push(`${key}=?`); values.push(key === "email" ? value.trim().toLowerCase() : value.trim()); }
		}
		if (flat !== undefined) { fields.push("flat_id=?"); values.push(flatId); }
		if (fields.length) {
			values.push(Number(req.params.id));
			await connection.execute(`UPDATE resident SET ${fields.join(",")} WHERE resident_id=?`, values);
		}
		if (active === false) {
			await connection.execute("UPDATE resident SET is_active=0 WHERE resident_id=?", [Number(req.params.id)]);
			await connection.execute("UPDATE app_user SET is_active=0 WHERE resident_id=?", [Number(req.params.id)]);
			const [accounts] = await connection.execute("SELECT user_id FROM app_user WHERE resident_id=?", [Number(req.params.id)]);
			for (const account of accounts) await connection.execute("DELETE FROM app_session WHERE user_id=?", [account.user_id]);
		} else if (active === true) {
			await connection.execute("UPDATE resident SET is_active=1 WHERE resident_id=?", [Number(req.params.id)]);
		}
		await connection.commit();
		res.json({ message: "Resident changes saved." });
	} catch (error) {
		if (connection) await connection.rollback();
		next(error);
	} finally { if (connection) connection.release(); }
});

module.exports = router;
