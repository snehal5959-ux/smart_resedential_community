const express = require("express");
const db = require("../db");
const { requireAuth, requireRole, requireCommunityAccount, requireManagerPermission } = require("../auth");

const router = express.Router();
router.use(requireAuth, requireCommunityAccount);

let lockSchemaReady;
function ensureLockSchema() {
	if (!lockSchemaReady) {
		lockSchemaReady = (async () => {
			await db.query(`CREATE TABLE IF NOT EXISTS flat_smart_lock (
				lock_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				society_id INT NOT NULL,
				flat_id BIGINT UNSIGNED NOT NULL,
				device_name VARCHAR(120) NOT NULL,
				provider VARCHAR(80) NOT NULL,
				lock_status VARCHAR(24) NOT NULL DEFAULT 'offline',
				battery_level TINYINT UNSIGNED NULL,
				last_seen DATETIME NULL,
				UNIQUE KEY uq_flat_smart_lock_flat (flat_id),
				KEY ix_flat_smart_lock_society (society_id),
				CONSTRAINT fk_flat_smart_lock_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT
			)`);
			await db.query(`CREATE TABLE IF NOT EXISTS flat_lock_event (
				event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
				society_id INT NOT NULL,
				flat_id BIGINT UNSIGNED NOT NULL,
				event_type VARCHAR(40) NOT NULL,
				description VARCHAR(255) NOT NULL,
				severity VARCHAR(16) NOT NULL DEFAULT 'info',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				KEY idx_flat_lock_event_created (created_at),
				KEY idx_flat_lock_event_flat (flat_id),
				KEY ix_flat_lock_event_society (society_id),
				CONSTRAINT fk_flat_lock_event_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT
			)`);
		})().catch((error) => { lockSchemaReady = undefined; throw error; });
	}
	return lockSchemaReady;
}

router.get("/vacant", requireManagerPermission("flats", "view"), async (req, res, next) => {
	try {
		const [flats] = await db.execute(`SELECT f.flat_id AS id,f.flat_number AS flat,
			CONCAT('Block ',f.block) AS block,f.floor_number AS floor,f.flat_type AS flatType
			FROM flat f WHERE f.society_id=? AND NOT EXISTS (
				SELECT 1 FROM resident r WHERE r.flat_id=f.flat_id AND r.is_active=1
			) ORDER BY f.block,f.floor_number,f.flat_number`, [req.user.societyId]);
		res.json(flats);
	} catch (error) { next(error); }
});

router.get("/security-directory", requireRole("security"), async (req, res, next) => {
	try {
		const [flats] = await db.execute(`SELECT f.flat_id AS id,f.flat_number AS flat,
			CONCAT('Block ',f.block) AS block,f.floor_number AS floor,f.flat_type AS flatType,
			CASE WHEN EXISTS (SELECT 1 FROM resident r WHERE r.flat_id=f.flat_id AND r.is_active=1)
				THEN 'Occupied' ELSE 'Vacant' END AS occupancy
			FROM flat f WHERE f.society_id=? ORDER BY f.block,f.floor_number,f.flat_number`, [req.user.societyId]);
		res.json(flats);
	} catch (error) { next(error); }
});

router.get("/options", requireRole("admin", "manager", "security"), requireManagerPermission("flats", "view"), async (req, res, next) => {
	try {
		const [flats] = await db.execute("SELECT flat_id AS id,flat_number AS flat,CONCAT('Block ',block) AS block FROM flat WHERE society_id=? ORDER BY block,floor_number,flat_number", [req.user.societyId]);
		res.json(flats);
	} catch (error) { next(error); }
});

router.get("/", requireRole("admin", "manager"), requireManagerPermission("flats", "view"), async (req, res, next) => {
	try {
		const [flats] = await db.execute(`SELECT f.flat_id AS id,f.flat_number AS flat,
			CONCAT('Block ',f.block) AS block,f.block AS blockCode,f.floor_number AS floor,
			f.flat_type AS flatType,COUNT(DISTINCT CASE WHEN r.is_active=1 THEN r.resident_id END) AS residentCount,
			GROUP_CONCAT(DISTINCT CASE WHEN r.is_active=1 THEN r.full_name END ORDER BY r.full_name SEPARATOR ', ') AS residents,
			CASE WHEN COUNT(DISTINCT CASE WHEN r.is_active=1 THEN r.resident_id END)>0 THEN 'Occupied' ELSE 'Vacant' END AS status
			FROM flat f LEFT JOIN resident r ON r.flat_id=f.flat_id
			WHERE f.society_id=? GROUP BY f.flat_id,f.flat_number,f.block,f.floor_number,f.flat_type
			ORDER BY f.block,f.floor_number,f.flat_number`, [req.user.societyId]);
		let locks = [];
		try {
			await ensureLockSchema();
			[locks] = await db.execute("SELECT lock_id AS lockId,flat_id AS flatId,device_name AS lockName,provider AS lockProvider,lock_status AS lockStatus,battery_level AS batteryLevel,last_seen AS lastSeen FROM flat_smart_lock WHERE society_id=?", [req.user.societyId]);
		} catch (error) { console.warn("Smart lock status is unavailable:", error.message); }
		const locksByFlat = new Map(locks.map((lock) => [String(lock.flatId), lock]));
		res.json(flats.map((flat) => ({ ...flat, ...locksByFlat.get(String(flat.id)), lockStatus: locksByFlat.get(String(flat.id))?.lockStatus || "not configured" })));
	} catch (error) { next(error); }
});

router.post("/", requireRole("admin", "manager"), requireManagerPermission("flats", "add"), async (req, res, next) => {
	const flatNumber = typeof req.body?.flat === "string" ? req.body.flat.trim() : "";
	const block = typeof req.body?.block === "string" ? req.body.block.trim().replace(/^Block\s+/i, "") : "";
	const floor = req.body?.floor === undefined || req.body.floor === "" ? 0 : Number(req.body.floor);
	const flatType = req.body?.flatType == null || req.body.flatType === "" ? null : String(req.body.flatType).trim();
	if (!/^[A-Za-z0-9-]{1,20}$/.test(flatNumber) || !/^[A-Za-z0-9-]{1,10}$/.test(block) || !Number.isInteger(floor) || floor < 0 || (flatType && flatType.length > 30)) {
		return res.status(400).json({ message: "Enter a valid flat number, block, floor, and flat type." });
	}
	try {
		const [result] = await db.execute("INSERT INTO flat (society_id,flat_number,block,floor_number,flat_type,status) VALUES (?,?,?,?,?,'Vacant')", [req.user.societyId, flatNumber, block, floor, flatType]);
		res.status(201).json({ id: result.insertId, flat: flatNumber, block: `Block ${block}`, blockCode: block, floor, flatType, residentCount: 0, residents: null, status: "Vacant", lockStatus: "not configured" });
	} catch (error) { next(error); }
});

router.patch("/:id", requireRole("admin", "manager"), requireManagerPermission("flats", "edit"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: "Flat ID is invalid." });
	const flatNumber = req.body?.flat;
	const blockInput = req.body?.block;
	const floor = req.body?.floor;
	const flatType = req.body?.flatType;
	const fields = [];
	const values = [];
	if (flatNumber !== undefined) {
		if (typeof flatNumber !== "string" || !/^[A-Za-z0-9-]{1,20}$/.test(flatNumber.trim())) return res.status(400).json({ message: "Enter a valid flat number." });
		fields.push("flat_number=?"); values.push(flatNumber.trim());
	}
	if (blockInput !== undefined) {
		const block = typeof blockInput === "string" ? blockInput.trim().replace(/^Block\s+/i, "") : "";
		if (!/^[A-Za-z0-9-]{1,10}$/.test(block)) return res.status(400).json({ message: "Enter a valid block." });
		fields.push("block=?"); values.push(block);
	}
	if (floor !== undefined) {
		if (!Number.isInteger(Number(floor)) || Number(floor) < 0) return res.status(400).json({ message: "Floor must be a non-negative number." });
		fields.push("floor_number=?"); values.push(Number(floor));
	}
	if (flatType !== undefined) {
		if (flatType !== null && (typeof flatType !== "string" || flatType.length > 30)) return res.status(400).json({ message: "Flat type must be 30 characters or fewer." });
		fields.push("flat_type=?"); values.push(typeof flatType === "string" ? flatType.trim() || null : null);
	}
	if (!fields.length) return res.status(400).json({ message: "Enter at least one flat field to update." });
	try {
		values.push(Number(req.params.id), req.user.societyId);
		const [result] = await db.execute(`UPDATE flat SET ${fields.join(",")} WHERE flat_id=? AND society_id=?`, values);
		if (!result.affectedRows) {
			const [rows] = await db.execute("SELECT flat_id FROM flat WHERE flat_id=? AND society_id=?", [Number(req.params.id), req.user.societyId]);
			if (!rows.length) return res.status(404).json({ message: "Flat not found." });
		}
		res.json({ message: "Flat changes saved." });
	} catch (error) { next(error); }
});

router.get("/lock-events", requireRole("admin", "manager"), requireManagerPermission("flats", "view"), async (req, res, next) => {
	try {
		await ensureLockSchema();
		const [events] = await db.execute(`SELECT e.event_id AS id,e.event_type AS type,e.description,
			e.severity,e.created_at AS createdAt,f.flat_number AS flat,CONCAT('Block ',f.block) AS block
			FROM flat_lock_event e JOIN flat f ON f.flat_id=e.flat_id
			WHERE e.society_id=? AND f.society_id=? ORDER BY e.created_at DESC,e.event_id DESC LIMIT 50`, [req.user.societyId, req.user.societyId]);
		res.json(events);
	} catch (error) { next(error); }
});

module.exports = router;
