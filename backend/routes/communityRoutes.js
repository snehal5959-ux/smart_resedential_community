const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireRole, requireCommunityAccount, requireManagerPermission } = require("../auth");

const router = express.Router();
const managers = requireRole("admin", "manager");
const isResidentRole = (role) => role === "resident" || role === "tenant";
const razorpayConfigurationMessage = "Configure a Razorpay key ID beginning with rzp_test_ or rzp_live_ and its matching secret in backend/.env.";
let schemaReady;
let calendarCache;

function getRazorpayCredentials() {
	const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
	const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
	return /^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId) && keySecret ? { keyId, keySecret } : null;
}

async function getCalendarNotices() {
	const country = (process.env.COMMUNITY_COUNTRY || "IN").trim().toUpperCase();
	const region = (process.env.COMMUNITY_REGION || "IN-MH").trim().toUpperCase();
	const now = new Date();
	if (calendarCache && calendarCache.expiresAt > Date.now() && calendarCache.country === country && calendarCache.region === region) return calendarCache.items;
	const years = [...new Set([now.getFullYear(), new Date(now.getTime() + 180 * 86400000).getFullYear()])];
	const results = await Promise.all(years.map(async (year) => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		try {
			const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
			if (!response.ok) throw new Error(`Holiday calendar returned ${response.status}`);
			return await response.json();
		} finally { clearTimeout(timeout); }
	}));
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const end = new Date(start.getTime() + 180 * 86400000);
	const items = results.flat().filter((item) => {
		const date = new Date(`${item.date}T00:00:00`);
		const local = Array.isArray(item.counties) && region && item.counties.some((county) => String(county).toUpperCase() === region);
		return date >= start && date <= end && (item.global || local);
	}).map((item) => ({
		id: `calendar-${item.countryCode}-${item.date}-${item.name}`,
		source: "calendar",
		scope: item.global ? "India-wide" : "Maharashtra",
		title: item.localName || item.name,
		description: item.name === item.localName ? "Calendar observance. Society arrangements are posted separately by the society manager." : `${item.name}. Society arrangements are posted separately by the society manager.`,
		date: item.date,
		country: item.countryCode,
	})).sort((a, b) => a.date.localeCompare(b.date));
	calendarCache = { country, region, items, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
	return items;
}

function ensureSchema() {
	if (!schemaReady) {
		schemaReady = (async () => {
			const statements = [
				`CREATE TABLE IF NOT EXISTS amenity (amenity_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, amenity_name VARCHAR(100) NOT NULL, description TEXT NULL, capacity INT UNSIGNED NOT NULL DEFAULT 0, hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00, status ENUM('Available','Under Maintenance') NOT NULL DEFAULT 'Available', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_amenity_society (society_id), CONSTRAINT fk_amenity_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS maintenance_bill (bill_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, flat_id BIGINT UNSIGNED NOT NULL, amount DECIMAL(12,2) NOT NULL, period VARCHAR(40) NOT NULL, due_date DATE NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'Pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_bill_flat_period (flat_id, period), KEY idx_bill_due (due_date, status), KEY ix_maintenance_bill_society (society_id), CONSTRAINT fk_maintenance_bill_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS maintenance_payment (payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, bill_id BIGINT UNSIGNED NOT NULL, amount DECIMAL(12,2) NOT NULL, method VARCHAR(32) NOT NULL, reference VARCHAR(120) NULL, paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_payment_bill (bill_id), KEY ix_maintenance_payment_society (society_id), CONSTRAINT fk_maintenance_payment_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS maintenance_payment_order (order_record_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, bill_id BIGINT UNSIGNED NOT NULL, resident_id BIGINT UNSIGNED NOT NULL, gateway_order_id VARCHAR(64) NOT NULL, gateway_payment_id VARCHAR(64) NULL, amount DECIMAL(12,2) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'Pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TIMESTAMP NULL, UNIQUE KEY uq_payment_gateway_order (gateway_order_id), UNIQUE KEY uq_payment_gateway_payment (gateway_payment_id), KEY idx_payment_order_bill (bill_id, status), CONSTRAINT fk_payment_order_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS community_complaint (complaint_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, resident_id BIGINT UNSIGNED NULL, subject VARCHAR(160) NOT NULL, category VARCHAR(80) NOT NULL, description TEXT NOT NULL, priority VARCHAR(16) NOT NULL DEFAULT 'Medium', status VARCHAR(24) NOT NULL DEFAULT 'Open', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_complaint_status (status, created_at), KEY ix_community_complaint_society (society_id), CONSTRAINT fk_community_complaint_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS amenity_booking (booking_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, resident_id BIGINT UNSIGNED NULL, amenity_id BIGINT UNSIGNED NOT NULL, start_at DATETIME NOT NULL, end_at DATETIME NOT NULL, notes VARCHAR(500) NULL, status VARCHAR(24) NOT NULL DEFAULT 'Pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_booking_times (amenity_id, start_at, end_at, status), KEY ix_amenity_booking_society (society_id), CONSTRAINT fk_amenity_booking_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS community_visitor (visitor_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, flat_id BIGINT UNSIGNED NOT NULL, resident_id BIGINT UNSIGNED NULL, visitor_name VARCHAR(120) NOT NULL, phone VARCHAR(30) NULL, purpose VARCHAR(200) NOT NULL, expected_at DATETIME NOT NULL, checked_in_at DATETIME NULL, checked_out_at DATETIME NULL, status VARCHAR(24) NOT NULL DEFAULT 'Expected', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_visitor_status (status, expected_at), KEY ix_community_visitor_society (society_id), CONSTRAINT fk_community_visitor_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS community_vehicle (vehicle_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, flat_id BIGINT UNSIGNED NOT NULL, vehicle_number VARCHAR(32) NOT NULL, vehicle_type VARCHAR(32) NOT NULL, parking_slot VARCHAR(32) NULL, status VARCHAR(24) NOT NULL DEFAULT 'Active', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_community_vehicle_registration (society_id,vehicle_number), KEY ix_community_vehicle_flat (flat_id), KEY ix_community_vehicle_society (society_id), CONSTRAINT fk_community_vehicle_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
				`CREATE TABLE IF NOT EXISTS community_notice (notice_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, society_id INT NOT NULL, title VARCHAR(180) NOT NULL, description TEXT NOT NULL, audience VARCHAR(100) NOT NULL DEFAULT 'All Residents', status VARCHAR(24) NOT NULL DEFAULT 'Draft', published_at DATETIME NULL, created_by BIGINT UNSIGNED NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_notice_published (status, published_at), KEY ix_community_notice_society (society_id), CONSTRAINT fk_community_notice_society FOREIGN KEY (society_id) REFERENCES society(society_id) ON UPDATE CASCADE ON DELETE RESTRICT)`,
			];
			for (const statement of statements) await db.query(statement);
		})().catch((error) => { schemaReady = undefined; throw error; });
	}
	return schemaReady;
}

router.use(requireAuth, requireCommunityAccount, async (req, res, next) => {
	try { await ensureSchema(); next(); }
	catch (error) { console.error("Community schema is unavailable:", error.message); res.status(503).json({ message: "Community data tables could not be initialized." }); }
});

router.get("/dashboard", requireRole("admin","manager","resident"), requireManagerPermission("dashboard", "view"), async (req, res, next) => {
	try {
		const { societyId, role, residentId } = req.user;
		const residentOnly = isResidentRole(role);
		const canView = (moduleName) => role !== "manager" || req.user.managerPermissions?.[moduleName]?.view === true;
		const [flatRows] = await db.execute(`SELECT f.flat_id,COUNT(DISTINCT CASE WHEN r.is_active=1 THEN r.resident_id END) occupied
			FROM flat f LEFT JOIN resident r ON r.flat_id=f.flat_id
			WHERE f.society_id=?${residentOnly ? " AND r.resident_id=?" : ""} GROUP BY f.flat_id`, residentOnly ? [societyId, residentId] : [societyId]);
		const occupied = flatRows.filter((row) => Number(row.occupied) > 0).length;
		const [[counts]] = await db.execute(`SELECT
			(SELECT COUNT(*) FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE f.society_id=? AND r.is_active=1${residentOnly ? " AND r.resident_id=?" : ""}) residents,
			(SELECT COUNT(*) FROM community_complaint c WHERE c.society_id=? AND c.status<>'Resolved'${residentOnly ? " AND c.resident_id=?" : ""}) openComplaints,
			(SELECT COUNT(*) FROM amenity_booking b WHERE b.society_id=? AND b.status IN ('Pending','Confirmed') AND b.end_at>=NOW()${residentOnly ? " AND b.resident_id=?" : ""}) upcomingBookings,
			(SELECT COUNT(*) FROM community_visitor v WHERE v.society_id=? AND v.status='Expected'${residentOnly ? " AND v.resident_id=?" : ""}) expectedVisitors`,
		residentOnly ? [societyId,residentId,societyId,residentId,societyId,residentId,societyId,residentId] : [societyId,societyId,societyId,societyId]);
		const [[billing]] = await db.execute(`SELECT COUNT(*) bills,COALESCE(SUM(b.amount-COALESCE(p.paid,0)),0) outstanding
			FROM maintenance_bill b JOIN flat f ON f.flat_id=b.flat_id
			LEFT JOIN (SELECT bill_id,SUM(amount) paid FROM maintenance_payment WHERE society_id=? GROUP BY bill_id) p ON p.bill_id=b.bill_id
			WHERE b.society_id=? AND f.society_id=?${residentOnly ? " AND EXISTS (SELECT 1 FROM resident r WHERE r.flat_id=f.flat_id AND r.resident_id=? AND r.is_active=1)" : ""}`,
		residentOnly ? [societyId,societyId,societyId,residentId] : [societyId,societyId,societyId]);
		const [collections] = await db.execute(`SELECT DATE_FORMAT(p.paid_at,'%Y-%m') month,SUM(p.amount) amount
			FROM maintenance_payment p
			WHERE p.society_id=? AND p.paid_at>=DATE_SUB(DATE_FORMAT(CURRENT_DATE(),'%Y-%m-01'),INTERVAL 5 MONTH)
			${residentOnly ? "AND EXISTS (SELECT 1 FROM maintenance_bill b JOIN flat f ON f.flat_id=b.flat_id JOIN resident r ON r.flat_id=f.flat_id WHERE b.bill_id=p.bill_id AND f.society_id=? AND r.resident_id=? AND r.is_active=1)" : ""}
			GROUP BY DATE_FORMAT(p.paid_at,'%Y-%m') ORDER BY month`, residentOnly ? [societyId,societyId,residentId] : [societyId]);
		const notices = canView("notices")
			? (await db.execute("SELECT notice_id id,title,description,audience,published_at publishedAt FROM community_notice WHERE society_id=? AND status='Published' ORDER BY published_at DESC LIMIT 5", [societyId]))[0]
			: [];
		res.json({
			flats: canView("flats") ? { total: flatRows.length, occupied, vacant: Math.max(0, flatRows.length - occupied) } : { total: 0, occupied: 0, vacant: 0 },
			residents: canView("residents") ? Number(counts.residents || 0) : 0,
			openComplaints: canView("complaints") ? Number(counts.openComplaints || 0) : 0,
			upcomingBookings: canView("bookings") ? Number(counts.upcomingBookings || 0) : 0,
			expectedVisitors: canView("visitors") ? Number(counts.expectedVisitors || 0) : 0,
			outstanding: canView("payments") ? Number(billing.outstanding || 0) : 0,
			bills: canView("maintenance") ? Number(billing.bills || 0) : 0,
			collections: canView("payments") ? collections.map((row) => ({ month: row.month, amount: Number(row.amount) })) : [],
			notices,
		});
	} catch (error) { next(error); }
});

router.get("/amenities", requireManagerPermission("amenities", "view"), async (req, res, next) => {
	try { const [rows] = await db.execute("SELECT amenity_id id,amenity_name name,description,capacity,hourly_rate hourlyRate,status FROM amenity WHERE society_id=? ORDER BY amenity_name", [req.user.societyId]); res.json(rows); }
	catch (error) { next(error); }
});
router.post("/amenities", managers, requireManagerPermission("amenities", "add"), async (req, res, next) => {
	const { name, description = "", capacity = 0, hourlyRate = 0 } = req.body || {};
	const numericCapacity = capacity === null || capacity === "" ? 0 : Number(capacity);
	const numericHourlyRate = hourlyRate === null || hourlyRate === "" ? 0 : Number(hourlyRate);
	if (typeof name !== "string" || !name.trim() || name.trim().length > 100 ||
		typeof description !== "string" || !Number.isInteger(numericCapacity) || numericCapacity < 0 ||
		!Number.isFinite(numericHourlyRate) || numericHourlyRate < 0 || numericHourlyRate > 99999999.99) return res.status(400).json({ message: "Enter an amenity name and valid details." });
	try {
		const [result] = await db.execute("INSERT INTO amenity (society_id,amenity_name,description,capacity,hourly_rate) VALUES (?,?,?,?,?)", [req.user.societyId,name.trim(),description.trim() || null,numericCapacity,numericHourlyRate]);
		res.status(201).json({ id: result.insertId,name: name.trim(),description: description.trim(),capacity: numericCapacity,hourlyRate: numericHourlyRate,status: "Available" });
	} catch (error) { next(error); }
});

router.get("/maintenance", requireRole("admin","manager","resident"), requireManagerPermission("maintenance", "view"), async (req, res, next) => {
	try {
		const own = isResidentRole(req.user.role);
		const [rows] = await db.execute(`SELECT b.bill_id id,b.flat_id flatId,f.flat_number flat,CONCAT('Block ',f.block) block,b.amount,b.period,b.due_date dueDate,b.status,COALESCE(p.paid,0) paid,(b.amount-COALESCE(p.paid,0)) balance
			FROM maintenance_bill b JOIN flat f ON f.flat_id=b.flat_id
			LEFT JOIN (SELECT bill_id,SUM(amount) paid FROM maintenance_payment WHERE society_id=? GROUP BY bill_id) p ON p.bill_id=b.bill_id
			WHERE b.society_id=? AND f.society_id=?${own ? " AND EXISTS (SELECT 1 FROM resident r WHERE r.flat_id=f.flat_id AND r.resident_id=? AND r.is_active=1)" : ""}
			ORDER BY b.due_date DESC,b.bill_id DESC`, own ? [req.user.societyId,req.user.societyId,req.user.societyId,req.user.residentId] : [req.user.societyId,req.user.societyId,req.user.societyId]);
		res.json(req.query.open === "true" ? rows.filter((row) => Number(row.balance) > 0) : rows);
	} catch (error) { next(error); }
});
router.post("/maintenance", managers, requireManagerPermission("maintenance", "add"), async (req, res, next) => {
	const { flatId, amount, period, dueDate } = req.body || {};
	const numericAmount = Number(amount);
	if (!Number.isInteger(Number(flatId)) || Number(flatId) < 1 || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100000000 || typeof period !== "string" || !period.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate || "")) return res.status(400).json({ message: "Choose a flat and enter a positive amount, billing period, and due date." });
	try {
		const [flats] = await db.execute("SELECT flat_id FROM flat WHERE flat_id=? AND society_id=?", [Number(flatId),req.user.societyId]);
		if (!flats.length) return res.status(400).json({ message: "Choose a flat in your community." });
		const [result] = await db.execute("INSERT INTO maintenance_bill (society_id,flat_id,amount,period,due_date) VALUES (?,?,?,?,?)", [req.user.societyId,Number(flatId),numericAmount,period.trim(),dueDate]);
		res.status(201).json({ id: result.insertId,flatId: Number(flatId),amount: numericAmount,period: period.trim(),dueDate,status: "Pending",paid: 0,balance: numericAmount });
	} catch (error) { next(error); }
});

router.get("/payments", requireRole("admin","manager","resident"), requireManagerPermission("payments", "view"), async (req, res, next) => {
	try {
		const own = isResidentRole(req.user.role);
		const [rows] = await db.execute(`SELECT p.payment_id id,CONCAT('PAY-',LPAD(p.payment_id,6,'0')) receipt,p.bill_id billId,f.flat_number flat,b.period,p.amount,p.method,p.reference,p.paid_at paidAt,r.full_name paidBy
			FROM maintenance_payment p JOIN maintenance_bill b ON b.bill_id=p.bill_id JOIN flat f ON f.flat_id=b.flat_id
			LEFT JOIN maintenance_payment_order po ON po.gateway_payment_id=p.reference AND po.society_id=p.society_id
			LEFT JOIN resident r ON r.resident_id=po.resident_id
			WHERE p.society_id=? AND b.society_id=? AND f.society_id=?${own ? " AND EXISTS (SELECT 1 FROM resident r WHERE r.flat_id=f.flat_id AND r.resident_id=? AND r.is_active=1)" : ""}
			ORDER BY p.paid_at DESC,p.payment_id DESC`, own ? [req.user.societyId,req.user.societyId,req.user.societyId,req.user.residentId] : [req.user.societyId,req.user.societyId,req.user.societyId]);
		res.json(rows);
	} catch (error) { next(error); }
});

router.post("/payments/orders", requireRole("resident"), async (req, res, next) => {
	const billId = Number(req.body?.billId);
	if (!Number.isSafeInteger(billId) || billId < 1) return res.status(400).json({ message: "Choose a valid bill to pay." });
	const credentials = getRazorpayCredentials();
	if (!credentials) return res.status(503).json({ message: razorpayConfigurationMessage });
	const { keyId, keySecret } = credentials;

	let connection;
	try {
		connection = await db.getConnection();
		await connection.beginTransaction();
		const [bills] = await connection.execute(
			`SELECT b.bill_id id,b.amount,f.flat_id
			FROM maintenance_bill b JOIN flat f ON f.flat_id=b.flat_id
			JOIN resident r ON r.flat_id=f.flat_id AND r.resident_id=? AND r.is_active=1
			WHERE b.bill_id=? AND b.society_id=? AND f.society_id=? FOR UPDATE`,
			[req.user.residentId,billId,req.user.societyId,req.user.societyId]
		);
		if (!bills.length) {
			await connection.rollback();
			return res.status(404).json({ message: "That bill is not available for your account." });
		}
		const [[paidTotal]] = await connection.execute(
			"SELECT COALESCE(SUM(amount),0) paid FROM maintenance_payment WHERE bill_id=? AND society_id=?",
			[billId,req.user.societyId]
		);
		const balance = Number(bills[0].amount) - Number(paidTotal.paid);
		const amountPaise = Math.round(balance * 100);
		if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
			await connection.rollback();
			return res.status(409).json({ message: "This bill has no remaining balance." });
		}

		const [pendingOrders] = await connection.execute(
			"SELECT gateway_order_id gatewayOrderId,amount,resident_id residentId FROM maintenance_payment_order WHERE bill_id=? AND society_id=? AND status='Pending' ORDER BY order_record_id DESC LIMIT 1",
			[billId,req.user.societyId]
		);
		if (pendingOrders.length && String(pendingOrders[0].residentId) !== String(req.user.residentId)) {
			await connection.rollback();
			return res.status(409).json({ message: "A payment for this bill is already in progress from another account in your flat. Complete it from the account that started it." });
		}
		let orderId;
		let orderAmount;
		if (pendingOrders.length) {
			orderId = pendingOrders[0].gatewayOrderId;
			orderAmount = Math.round(Number(pendingOrders[0].amount) * 100);
		} else {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10000);
			let gatewayResponse;
			try {
				gatewayResponse = await fetch("https://api.razorpay.com/v1/orders", {
					method: "POST",
					headers: {
						Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						amount: amountPaise,
						currency: "INR",
						receipt: `bill-${billId}-${Date.now()}`,
						notes: { society_id: String(req.user.societyId), bill_id: String(billId) },
					}),
					signal: controller.signal,
				});
			} catch (error) {
				clearTimeout(timeout);
				throw Object.assign(new Error("The payment provider could not be reached."), { statusCode: 502, cause: error });
			}
			clearTimeout(timeout);
			const gatewayOrder = await gatewayResponse.json().catch(() => null);
			if (!gatewayResponse.ok || typeof gatewayOrder?.id !== "string") {
				const providerCode = typeof gatewayOrder?.error?.code === "string" ? gatewayOrder.error.code : "UNKNOWN";
				console.error("Razorpay order creation failed:", { status: gatewayResponse.status, code: providerCode });
				const message = [401, 403].includes(gatewayResponse.status)
					? "Razorpay rejected the configured key pair. Check that the key ID and secret belong to the same test or live account."
					: gatewayResponse.status === 400
						? "Razorpay rejected this bill order. Check the bill amount and Razorpay account settings."
						: "Razorpay could not create this order. Check the backend payment logs and try again.";
				throw Object.assign(new Error(message), { statusCode: 502 });
			}
			orderId = gatewayOrder.id;
			orderAmount = amountPaise;
			await connection.execute(
				"INSERT INTO maintenance_payment_order (society_id,bill_id,resident_id,gateway_order_id,amount) VALUES (?,?,?,?,?)",
				[req.user.societyId,billId,req.user.residentId,orderId,balance]
			);
		}
		await connection.commit();
		res.json({ keyId,orderId,amount: orderAmount,currency: "INR",billId,description: `Community bill ${billId}` });
	} catch (error) {
		if (connection) await connection.rollback();
		if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
		next(error);
	} finally {
		if (connection) connection.release();
	}
});

router.post("/payments/verify", requireRole("resident"), async (req, res, next) => {
	const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
	if (typeof orderId !== "string" || orderId.length > 64 || typeof paymentId !== "string" || paymentId.length > 64 ||
		typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
		return res.status(400).json({ message: "The payment confirmation is incomplete or invalid." });
	}
	const credentials = getRazorpayCredentials();
	if (!credentials) return res.status(503).json({ message: razorpayConfigurationMessage });
	const { keyId, keySecret } = credentials;
	const expectedSignature = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest();
	const receivedSignature = Buffer.from(signature, "hex");
	if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(receivedSignature, expectedSignature)) {
		return res.status(400).json({ message: "The payment signature could not be verified." });
	}

	try {
		const [orders] = await db.execute(
			`SELECT po.order_record_id id,po.bill_id billId,po.amount,po.status,b.flat_id flatId
			FROM maintenance_payment_order po JOIN maintenance_bill b ON b.bill_id=po.bill_id
			JOIN resident r ON r.flat_id=b.flat_id AND r.resident_id=? AND r.is_active=1
			WHERE po.gateway_order_id=? AND po.society_id=? AND b.society_id=? AND r.flat_id=b.flat_id LIMIT 1`,
			[req.user.residentId,orderId,req.user.societyId,req.user.societyId]
		);
		if (!orders.length) return res.status(404).json({ message: "That payment order is not available for your account." });
		if (orders[0].status === "Paid") return res.json({ message: "Payment already confirmed." });

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);
		let gatewayResponse;
		try {
			gatewayResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
				headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` },
				signal: controller.signal,
			});
		} catch (error) {
			clearTimeout(timeout);
			throw Object.assign(new Error("The payment provider could not be reached to confirm payment."), { statusCode: 502, cause: error });
		}
		clearTimeout(timeout);
		const gatewayPayment = await gatewayResponse.json().catch(() => null);
		if (!gatewayResponse.ok || gatewayPayment?.order_id !== orderId ||
			gatewayPayment?.status !== "captured" || Number(gatewayPayment?.amount) !== Math.round(Number(orders[0].amount) * 100)) {
			return res.status(409).json({ message: "The payment is not yet captured by the provider. Refresh and try again shortly." });
		}

		const connection = await db.getConnection();
		try {
			await connection.beginTransaction();
			const [lockedOrders] = await connection.execute(
				"SELECT order_record_id id,bill_id billId,amount,status,gateway_payment_id gatewayPaymentId FROM maintenance_payment_order WHERE gateway_order_id=? AND society_id=? FOR UPDATE",
				[orderId,req.user.societyId]
			);
			if (!lockedOrders.length) {
				await connection.rollback();
				return res.status(404).json({ message: "That payment order is no longer available." });
			}
			if (lockedOrders[0].status === "Paid") {
				await connection.commit();
				return res.json({ message: "Payment already confirmed." });
			}
			if (lockedOrders[0].gatewayPaymentId && lockedOrders[0].gatewayPaymentId !== paymentId) {
				await connection.rollback();
				return res.status(409).json({ message: "This order is already linked to another payment." });
			}
			const [bills] = await connection.execute(
				"SELECT amount FROM maintenance_bill WHERE bill_id=? AND society_id=? FOR UPDATE",
				[lockedOrders[0].billId,req.user.societyId]
			);
			const [[paidTotal]] = await connection.execute(
				"SELECT COALESCE(SUM(amount),0) paid FROM maintenance_payment WHERE bill_id=? AND society_id=?",
				[lockedOrders[0].billId,req.user.societyId]
			);
			const balance = Number(bills[0].amount) - Number(paidTotal.paid);
			const paidAmount = Number(lockedOrders[0].amount);
			if (paidAmount > balance + 0.001) {
				await connection.rollback();
				return res.status(409).json({ message: "The bill balance changed while the payment was processing. Contact your community manager to reconcile this captured payment." });
			}
			await connection.execute(
				"INSERT INTO maintenance_payment (society_id,bill_id,amount,method,reference) VALUES (?,?,?,?,?)",
				[req.user.societyId,lockedOrders[0].billId,paidAmount,"Razorpay",paymentId]
			);
			const newStatus = paidAmount >= balance - 0.001 ? "Paid" : "Partial";
			await connection.execute("UPDATE maintenance_bill SET status=? WHERE bill_id=? AND society_id=?", [newStatus,lockedOrders[0].billId,req.user.societyId]);
			await connection.execute(
				"UPDATE maintenance_payment_order SET gateway_payment_id=?,status='Paid',paid_at=NOW() WHERE order_record_id=? AND status='Pending'",
				[paymentId,lockedOrders[0].id]
			);
			await connection.commit();
			res.json({ message: "Payment confirmed." });
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	} catch (error) {
		if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
		next(error);
	}
});

router.post("/payments", managers, requireManagerPermission("payments", "add"), async (req, res, next) => {
	const { billId, amount, method, reference = "" } = req.body || {};
	if (!Number.isInteger(Number(billId)) || Number(billId) < 1 || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !["Cash","UPI","Card","Bank Transfer","Cheque"].includes(method) || typeof reference !== "string" || reference.length > 120) return res.status(400).json({ message: "Select a bill, positive payment amount, and valid payment method." });
	const connection = await db.getConnection();
	try {
		await connection.beginTransaction();
		const [bills] = await connection.execute("SELECT amount FROM maintenance_bill WHERE bill_id=? AND society_id=? FOR UPDATE", [Number(billId),req.user.societyId]);
		if (!bills.length) { await connection.rollback(); return res.status(404).json({ message: "Maintenance bill not found." }); }
		const [pendingOrders] = await connection.execute("SELECT order_record_id FROM maintenance_payment_order WHERE bill_id=? AND society_id=? AND status='Pending' LIMIT 1", [Number(billId),req.user.societyId]);
		if (pendingOrders.length) { await connection.rollback(); return res.status(409).json({ message: "This bill has an online payment in progress. Ask the resident to finish or retry it before recording another payment." }); }
		const [[paidTotal]] = await connection.execute("SELECT COALESCE(SUM(amount),0) paid FROM maintenance_payment WHERE bill_id=? AND society_id=?", [Number(billId),req.user.societyId]);
		const balance = Number(bills[0].amount) - Number(paidTotal.paid);
		if (Number(amount) > balance + 0.001) { await connection.rollback(); return res.status(400).json({ message: "Payment cannot exceed the remaining bill balance." }); }
		const [result] = await connection.execute("INSERT INTO maintenance_payment (society_id,bill_id,amount,method,reference) VALUES (?,?,?,?,?)", [req.user.societyId,Number(billId),Number(amount),method,reference.trim() || null]);
		const newStatus = Number(amount) >= balance - 0.001 ? "Paid" : "Partial";
		await connection.execute("UPDATE maintenance_bill SET status=? WHERE bill_id=? AND society_id=?", [newStatus,Number(billId),req.user.societyId]);
		await connection.commit();
		res.status(201).json({ id: result.insertId,billId: Number(billId),amount: Number(amount),method,status: "Recorded" });
	} catch (error) { await connection.rollback(); next(error); }
	finally { connection.release(); }
});

router.get("/complaints", requireRole("admin","manager","resident"), requireManagerPermission("complaints", "view"), async (req, res, next) => {
	try {
		const own = isResidentRole(req.user.role);
		const [rows] = await db.execute(`SELECT c.complaint_id id,c.subject,c.category,c.description,c.priority,c.status,c.created_at createdAt,r.full_name resident,f.flat_number flat,CONCAT('Block ',f.block) block
			FROM community_complaint c LEFT JOIN resident r ON r.resident_id=c.resident_id LEFT JOIN flat f ON f.flat_id=r.flat_id
			WHERE c.society_id=?${own ? " AND c.resident_id=?" : ""} ORDER BY c.created_at DESC`, own ? [req.user.societyId,req.user.residentId] : [req.user.societyId]);
		res.json(rows);
	} catch (error) { next(error); }
});
router.post("/complaints", requireRole("admin","manager","resident"), requireManagerPermission("complaints", "add"), async (req, res, next) => {
	const { subject, category, description, priority = "Medium" } = req.body || {};
	if (typeof subject !== "string" || !subject.trim() || typeof category !== "string" || !category.trim() || typeof description !== "string" || !description.trim() || !["Low","Medium","High"].includes(priority)) return res.status(400).json({ message: "Subject, category, details, and valid priority are required." });
	let residentId = null;
	if (isResidentRole(req.user.role)) {
		if (!req.user.residentId) return res.status(403).json({ message: "Your account is not linked to an active resident record." });
		residentId = req.user.residentId;
	} else if (req.body?.residentId !== undefined && req.body.residentId !== null && req.body.residentId !== "") {
		residentId = Number(req.body.residentId);
		const [linked] = await db.execute("SELECT r.resident_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? AND r.is_active=1", [residentId,req.user.societyId]);
		if (!Number.isInteger(residentId) || !linked.length) return res.status(400).json({ message: "Choose an active resident in your community." });
	}
	try {
		const [result] = await db.execute("INSERT INTO community_complaint (society_id,resident_id,subject,category,description,priority) VALUES (?,?,?,?,?,?)", [req.user.societyId,residentId,subject.trim(),category.trim(),description.trim(),priority]);
		res.status(201).json({ id: result.insertId,subject: subject.trim(),category: category.trim(),priority,status: "Open" });
	} catch (error) { next(error); }
});
router.patch("/complaints/:id", managers, requireManagerPermission("complaints", "edit"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id) || !["Open","In Progress","Resolved"].includes(req.body?.status)) return res.status(400).json({ message: "Choose Open, In Progress, or Resolved." });
	try {
		const [result] = await db.execute("UPDATE community_complaint SET status=? WHERE complaint_id=? AND society_id=?", [req.body.status,Number(req.params.id),req.user.societyId]);
		if (!result.affectedRows) return res.status(404).json({ message: "Complaint not found." });
		res.json({ message: "Complaint updated." });
	} catch (error) { next(error); }
});

router.get("/bookings", requireRole("admin","manager","resident"), requireManagerPermission("bookings", "view"), async (req, res, next) => {
	try {
		const own = isResidentRole(req.user.role);
		const [rows] = await db.execute(`SELECT b.booking_id id,b.resident_id residentId,r.full_name resident,a.amenity_name amenity,b.start_at startAt,b.end_at endAt,b.notes,b.status
			FROM amenity_booking b JOIN amenity a ON a.amenity_id=b.amenity_id LEFT JOIN resident r ON r.resident_id=b.resident_id
			WHERE b.society_id=? AND a.society_id=?${own ? " AND b.resident_id=?" : ""} ORDER BY b.start_at DESC`, own ? [req.user.societyId,req.user.societyId,req.user.residentId] : [req.user.societyId,req.user.societyId]);
		res.json(rows);
	} catch (error) { next(error); }
});
router.post("/bookings", requireRole("admin","manager","resident"), requireManagerPermission("bookings", "add"), async (req, res, next) => {
	const { amenityId, startAt, endAt, notes = "" } = req.body || {};
	const start = new Date(startAt); const end = new Date(endAt);
	if (!Number.isInteger(Number(amenityId)) || Number(amenityId) < 1 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || typeof notes !== "string" || notes.length > 500) return res.status(400).json({ message: "Choose an amenity and a valid start and end time." });
	const [amenities] = await db.execute("SELECT amenity_id FROM amenity WHERE amenity_id=? AND society_id=? AND status='Available'", [Number(amenityId),req.user.societyId]);
	if (!amenities.length) return res.status(400).json({ message: "Choose an available amenity in your community." });
	let residentId = null;
	if (isResidentRole(req.user.role)) {
		if (!req.user.residentId) return res.status(403).json({ message: "Your account is not linked to an active resident record." });
		residentId = req.user.residentId;
	} else if (req.body?.residentId !== undefined && req.body.residentId !== null && req.body.residentId !== "") {
		residentId = Number(req.body.residentId);
		const [linked] = await db.execute("SELECT r.resident_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? AND r.is_active=1", [residentId,req.user.societyId]);
		if (!Number.isInteger(residentId) || !linked.length) return res.status(400).json({ message: "Choose an active resident in your community." });
	}
	try {
		const [conflicts] = await db.execute("SELECT booking_id FROM amenity_booking WHERE society_id=? AND amenity_id=? AND status IN ('Pending','Confirmed') AND start_at<? AND end_at>? LIMIT 1", [req.user.societyId,Number(amenityId),end,start]);
		if (conflicts.length) return res.status(409).json({ message: "That amenity already has a booking during this time." });
		const [result] = await db.execute("INSERT INTO amenity_booking (society_id,resident_id,amenity_id,start_at,end_at,notes) VALUES (?,?,?,?,?,?)", [req.user.societyId,residentId,Number(amenityId),start,end,notes.trim() || null]);
		res.status(201).json({ id: result.insertId,amenityId: Number(amenityId),startAt,endAt,status: "Pending" });
	} catch (error) { next(error); }
});
router.patch("/bookings/:id", managers, requireManagerPermission("bookings", "edit"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id) || !["Pending","Confirmed","Cancelled","Completed"].includes(req.body?.status)) return res.status(400).json({ message: "Invalid booking status." });
	try {
		const [result] = await db.execute("UPDATE amenity_booking SET status=? WHERE booking_id=? AND society_id=?", [req.body.status,Number(req.params.id),req.user.societyId]);
		if (!result.affectedRows) return res.status(404).json({ message: "Booking not found." });
		res.json({ message: "Booking updated." });
	} catch (error) { next(error); }
});

router.get("/visitors", requireManagerPermission("visitors", "view"), async (req, res, next) => {
	try {
		const own = isResidentRole(req.user.role);
		const [rows] = await db.execute(`SELECT v.visitor_id id,v.visitor_name name,v.phone,v.purpose,v.expected_at expectedAt,v.checked_in_at checkedInAt,v.checked_out_at checkedOutAt,v.status,f.flat_number flat,CONCAT('Block ',f.block) block
			FROM community_visitor v JOIN flat f ON f.flat_id=v.flat_id WHERE v.society_id=? AND f.society_id=?${own ? " AND v.resident_id=?" : ""} ORDER BY v.expected_at DESC LIMIT 500`, own ? [req.user.societyId,req.user.societyId,req.user.residentId] : [req.user.societyId,req.user.societyId]);
		res.json(rows);
	} catch (error) { next(error); }
});
router.post("/visitors", requireManagerPermission("visitors", "add"), async (req, res, next) => {
	const { name, phone = "", purpose, expectedAt } = req.body || {};
	const expected = new Date(expectedAt);
	if (typeof name !== "string" || !name.trim() || name.length > 120 || typeof phone !== "string" || phone.length > 30 || typeof purpose !== "string" || !purpose.trim() || purpose.length > 200 || !Number.isFinite(expected.getTime())) return res.status(400).json({ message: "Visitor name, purpose, and a valid arrival time are required." });
	let flatId;
	let residentId = null;
	if (isResidentRole(req.user.role)) {
		const [residents] = await db.execute("SELECT r.resident_id,r.flat_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE r.resident_id=? AND f.society_id=? AND r.is_active=1", [req.user.residentId,req.user.societyId]);
		if (!residents.length) return res.status(403).json({ message: "Your account is not linked to an active resident record." });
		flatId = residents[0].flat_id; residentId = residents[0].resident_id;
	} else {
		flatId = Number(req.body?.flatId);
		if (!Number.isInteger(flatId) || flatId < 1) return res.status(400).json({ message: "Choose a flat in your community." });
		const [flats] = await db.execute("SELECT flat_id FROM flat WHERE flat_id=? AND society_id=?", [flatId,req.user.societyId]);
		if (!flats.length) return res.status(400).json({ message: "Choose a flat in your community." });
		if (req.body?.residentId !== undefined && req.body.residentId !== null && req.body.residentId !== "") {
			residentId = Number(req.body.residentId);
			const [linked] = await db.execute("SELECT resident_id FROM resident WHERE resident_id=? AND flat_id=? AND is_active=1", [residentId,flatId]);
			if (!Number.isInteger(residentId) || !linked.length) return res.status(400).json({ message: "Choose a resident assigned to that flat." });
		}
	}
	try {
		const [result] = await db.execute("INSERT INTO community_visitor (society_id,flat_id,resident_id,visitor_name,phone,purpose,expected_at) VALUES (?,?,?,?,?,?,?)", [req.user.societyId,flatId,residentId,name.trim(),phone.trim() || null,purpose.trim(),expected]);
		res.status(201).json({ id: result.insertId,name: name.trim(),purpose: purpose.trim(),expectedAt,status: "Expected" });
	} catch (error) { next(error); }
});
router.patch("/visitors/:id", requireRole("admin","manager","security"), requireManagerPermission("visitors", "edit"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id) || !["Checked In","Checked Out"].includes(req.body?.status)) return res.status(400).json({ message: "Visitor status must be Checked In or Checked Out." });
	const sql = req.body.status === "Checked In" ? "UPDATE community_visitor SET status='Checked In',checked_in_at=NOW() WHERE visitor_id=? AND society_id=? AND status='Expected'" : "UPDATE community_visitor SET status='Checked Out',checked_out_at=NOW() WHERE visitor_id=? AND society_id=? AND status='Checked In'";
	try {
		const [result] = await db.execute(sql,[Number(req.params.id),req.user.societyId]);
		if (!result.affectedRows) return res.status(409).json({ message: "Visitor could not be moved to that status." });
		res.json({ message: "Visitor log updated." });
	} catch (error) { next(error); }
});

router.get("/vehicles", requireRole("admin","manager","security"), requireManagerPermission("vehicles", "view"), async (req, res, next) => {
	try {
		const [rows] = await db.execute(`SELECT v.vehicle_id id,v.vehicle_number number,
			COALESCE(GROUP_CONCAT(DISTINCT r.full_name ORDER BY r.full_name SEPARATOR ', '),'—') resident,
			f.flat_number flat,CONCAT('Block ',f.block) block,v.vehicle_type type,
			COALESCE(v.parking_slot,'—') parking,v.status
			FROM community_vehicle v JOIN flat f ON f.flat_id=v.flat_id AND f.society_id=v.society_id
			LEFT JOIN resident r ON r.flat_id=f.flat_id AND r.society_id=f.society_id AND r.is_active=1
			WHERE v.society_id=? GROUP BY v.vehicle_id,v.vehicle_number,f.flat_number,f.block,v.vehicle_type,v.parking_slot,v.status
			ORDER BY f.block,f.flat_number,v.vehicle_number`, [req.user.societyId]);
		res.json(rows);
	} catch (error) { next(error); }
});

router.post("/vehicles", managers, requireManagerPermission("vehicles", "add"), async (req, res, next) => {
	const flatId = Number(req.body?.flatId);
	const number = typeof req.body?.number === "string" ? req.body.number.trim().toUpperCase() : "";
	const type = typeof req.body?.type === "string" ? req.body.type.trim() : "";
	const parking = typeof req.body?.parking === "string" ? req.body.parking.trim() : "";
	if (!Number.isSafeInteger(flatId) || flatId < 1 || !/^[A-Z0-9 -]{2,32}$/.test(number) ||
		!type || type.length > 32 || parking.length > 32) {
		return res.status(400).json({ message: "Choose a flat and enter a valid vehicle number, type, and parking slot." });
	}
	try {
		const [flats] = await db.execute("SELECT flat_id FROM flat WHERE flat_id=? AND society_id=?", [flatId, req.user.societyId]);
		if (!flats.length) return res.status(400).json({ message: "Choose a flat in the selected society." });
		const [result] = await db.execute(
			"INSERT INTO community_vehicle (society_id,flat_id,vehicle_number,vehicle_type,parking_slot) VALUES (?,?,?,?,?)",
			[req.user.societyId, flatId, number, type, parking || null]
		);
		res.status(201).json({ id: result.insertId, number, flatId, type, parking: parking || "—", status: "Active" });
	} catch (error) {
		if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "That vehicle is already registered in this society." });
		next(error);
	}
});

router.patch("/vehicles/:id", managers, requireManagerPermission("vehicles", "edit"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id) || !["Active","Inactive"].includes(req.body?.status)) {
		return res.status(400).json({ message: "Choose a valid vehicle status." });
	}
	try {
		const [result] = await db.execute(
			"UPDATE community_vehicle SET status=? WHERE vehicle_id=? AND society_id=?",
			[req.body.status, Number(req.params.id), req.user.societyId]
		);
		if (!result.affectedRows) return res.status(404).json({ message: "Vehicle not found." });
		res.json({ message: "Vehicle status updated." });
	} catch (error) { next(error); }
});

router.get("/notices", requireManagerPermission("notices", "view"), async (req, res, next) => {
	try {
		const drafts = ["admin","manager"].includes(req.user.role) ? "" : "AND status='Published'";
		const [rows] = await db.execute(`SELECT notice_id id,title,description,audience,status,published_at publishedAt,created_at createdAt FROM community_notice WHERE society_id=? ${drafts} ORDER BY COALESCE(published_at,created_at) DESC`, [req.user.societyId]);
		let calendar = []; let calendarAvailable = true;
		try { calendar = await getCalendarNotices(); }
		catch (error) { calendarAvailable = false; console.warn("Public holiday calendar is unavailable:", error.message); }
		res.json({ society: rows.map((row) => ({ ...row,source: "society" })),calendar,calendarAvailable,location: process.env.COMMUNITY_LOCATION || "Pune, Maharashtra, India" });
	} catch (error) { next(error); }
});
router.post("/notices", managers, requireManagerPermission("notices", "add"), async (req, res, next) => {
	const { title, description, audience = "All Residents", status = "Draft" } = req.body || {};
	if (typeof title !== "string" || !title.trim() || typeof description !== "string" || !description.trim() || typeof audience !== "string" || !["Draft","Published"].includes(status)) return res.status(400).json({ message: "Enter a notice title, description, audience, and valid status." });
	try {
		const [result] = await db.execute("INSERT INTO community_notice (society_id,title,description,audience,status,published_at,created_by) VALUES (?,?,?,?,?,?,?)", [req.user.societyId,title.trim(),description.trim(),audience.trim(),status,status === "Published" ? new Date() : null,req.user.id]);
		res.status(201).json({ id: result.insertId,title: title.trim(),description: description.trim(),audience: audience.trim(),status });
	} catch (error) { next(error); }
});
router.patch("/notices/:id", managers, requireManagerPermission("notices", "edit"), async (req, res, next) => {
	if (!/^\d+$/.test(req.params.id) || !["Draft","Published","Archived"].includes(req.body?.status)) return res.status(400).json({ message: "Invalid notice status." });
	try {
		const [result] = await db.execute("UPDATE community_notice SET status=?,published_at=IF(?='Published',COALESCE(published_at,NOW()),published_at) WHERE notice_id=? AND society_id=?", [req.body.status,req.body.status,Number(req.params.id),req.user.societyId]);
		if (!result.affectedRows) return res.status(404).json({ message: "Notice not found." });
		res.json({ message: "Notice updated." });
	} catch (error) { next(error); }
});

router.get("/reports", managers, requireManagerPermission("reports", "view"), async (req, res, next) => {
	try {
		const societyId = req.user.societyId;
		const [[billing]] = await db.execute(`SELECT COUNT(*) bills,COALESCE(SUM(b.amount),0) billed,COALESCE(SUM(p.paid),0) collected,COALESCE(SUM(b.amount-COALESCE(p.paid,0)),0) outstanding
			FROM maintenance_bill b LEFT JOIN (SELECT bill_id,SUM(amount) paid FROM maintenance_payment WHERE society_id=? GROUP BY bill_id) p ON p.bill_id=b.bill_id
			WHERE b.society_id=?`, [societyId,societyId]);
		const [monthly] = await db.execute("SELECT period,COUNT(*) bills,COALESCE(SUM(amount),0) billed,SUM(status='Paid') paidBills FROM maintenance_bill WHERE society_id=? GROUP BY period ORDER BY MIN(due_date) DESC LIMIT 12", [societyId]);
		const [complaints] = await db.execute("SELECT status,COUNT(*) count FROM community_complaint WHERE society_id=? GROUP BY status", [societyId]);
		const [occupancy] = await db.execute(`SELECT CONCAT('Block ',f.block) block,COUNT(*) total,SUM(x.residents>0) occupied
			FROM flat f JOIN (SELECT f2.flat_id,COUNT(CASE WHEN r.is_active=1 THEN r.resident_id END) residents FROM flat f2 LEFT JOIN resident r ON r.flat_id=f2.flat_id WHERE f2.society_id=? GROUP BY f2.flat_id) x ON x.flat_id=f.flat_id
			WHERE f.society_id=? GROUP BY f.block ORDER BY f.block`, [societyId,societyId]);
		res.json({ billing,monthly,complaints,occupancy });
	} catch (error) { next(error); }
});

module.exports = router;
