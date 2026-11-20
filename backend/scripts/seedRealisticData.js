const db = require("../db");

const databaseName = "society_residential";
const societyId = Number(process.env.SEED_SOCIETY_ID || 2);

function sqlDate(date) {
	return date.toISOString().slice(0, 19).replace("T", " ");
}

function dateOffset(days, hour, minute = 0) {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + days);
	date.setUTCHours(hour, minute, 0, 0);
	return date;
}

async function insertRows(connection, table, columns, rows) {
	if (!rows.length) return;
	const columnList = columns.map((column) => `\`${column}\``).join(",");
	const placeholders = rows.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
	await connection.execute(
		`INSERT INTO \`${table}\` (${columnList}) VALUES ${placeholders}`,
		rows.flat()
	);
}

async function removePreviousSyntheticRows(connection) {
	await connection.execute(
		"DELETE FROM community_visitor WHERE society_id=? AND visitor_name LIKE '[Sample] %'",
		[societyId]
	);
	await connection.execute(
		"DELETE FROM community_complaint WHERE society_id=? AND subject LIKE '[Sample] %'",
		[societyId]
	);
	await connection.execute(
		"DELETE FROM community_notice WHERE society_id=? AND title LIKE '[Sample] %'",
		[societyId]
	);
	await connection.execute(
		"DELETE FROM amenity_booking WHERE society_id=? AND notes LIKE '[Sample] %'",
		[societyId]
	);
	await connection.execute(
		"DELETE FROM community_visitor WHERE society_id=? AND (visitor_name LIKE 'Demo Guest %' OR purpose='Synthetic demo visit.')",
		[societyId]
	);
	await connection.execute(
		"DELETE FROM community_complaint WHERE society_id=? AND subject LIKE '[DEMO] Community request %'",
		[societyId]
	);
	await connection.execute(
		"DELETE FROM community_notice WHERE society_id=? AND title LIKE '[DEMO] Community notice %'",
		[societyId]
	);
	await connection.execute(
		"DELETE FROM amenity_booking WHERE society_id=? AND notes LIKE '[DEMO]%'",
		[societyId]
	);

	const [demoBills] = await connection.execute(
		"SELECT bill_id FROM maintenance_bill WHERE society_id=? AND period LIKE 'DEMO-2026-%'",
		[societyId]
	);
	if (demoBills.length) {
		const billIds = demoBills.map((bill) => bill.bill_id);
		const placeholders = billIds.map(() => "?").join(",");
		const [payments] = await connection.execute(
			`SELECT payment_id FROM maintenance_payment WHERE society_id=? AND bill_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...billIds]
		);
		const [orders] = await connection.execute(
			`SELECT order_record_id FROM maintenance_payment_order WHERE society_id=? AND bill_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...billIds]
		);
		if (payments.length || orders.length) {
			throw new Error("Generated demo bills now have payment records. No bills were deleted; reconcile those test transactions manually before cleanup.");
		}
		await connection.execute(
			"DELETE FROM maintenance_bill WHERE society_id=? AND period LIKE 'DEMO-2026-%'",
			[societyId]
		);
	}

	const [demoAmenities] = await connection.execute(
		"SELECT amenity_id FROM amenity WHERE society_id=? AND amenity_name LIKE 'Demo Amenity %'",
		[societyId]
	);
	if (demoAmenities.length) {
		const amenityIds = demoAmenities.map((amenity) => amenity.amenity_id);
		const placeholders = amenityIds.map(() => "?").join(",");
		const [bookings] = await connection.execute(
			`SELECT booking_id FROM amenity_booking WHERE society_id=? AND amenity_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...amenityIds]
		);
		if (bookings.length) {
			throw new Error("Generated amenities have additional bookings. No amenities were deleted; review those bookings before cleanup.");
		}
		await connection.execute(
			"DELETE FROM amenity WHERE society_id=? AND amenity_name LIKE 'Demo Amenity %'",
			[societyId]
		);
	}

	const [demoResidents] = await connection.execute(
		`SELECT r.resident_id FROM resident r JOIN flat f ON f.flat_id=r.flat_id
			WHERE f.society_id=? AND r.email LIKE 'demo.resident.%@example.test'`,
		[societyId]
	);
	if (demoResidents.length) {
		const residentIds = demoResidents.map((resident) => resident.resident_id);
		const placeholders = residentIds.map(() => "?").join(",");
		const [accounts] = await connection.execute(
			`SELECT user_id FROM app_user WHERE resident_id IN (${placeholders}) LIMIT 1`,
			residentIds
		);
		const [bookings] = await connection.execute(
			`SELECT booking_id FROM amenity_booking WHERE society_id=? AND resident_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...residentIds]
		);
		const [complaints] = await connection.execute(
			`SELECT complaint_id FROM community_complaint WHERE society_id=? AND resident_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...residentIds]
		);
		const [visitors] = await connection.execute(
			`SELECT visitor_id FROM community_visitor WHERE society_id=? AND resident_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...residentIds]
		);
		if (accounts.length || bookings.length || complaints.length || visitors.length) {
			throw new Error("Generated residents now have linked accounts or community records. No residents or units were deleted; review the linked records before cleanup.");
		}
		await connection.execute(
			`DELETE r FROM resident r JOIN flat f ON f.flat_id=r.flat_id
				WHERE f.society_id=? AND r.email LIKE 'demo.resident.%@example.test'`,
			[societyId]
		);
	}

	const [demoFlats] = await connection.execute(
		"SELECT flat_id FROM flat WHERE society_id=? AND block='DEMO' AND flat_number LIKE 'DEMO-%'",
		[societyId]
	);
	if (demoFlats.length) {
		const flatIds = demoFlats.map((flat) => flat.flat_id);
		const placeholders = flatIds.map(() => "?").join(",");
		const [residents] = await connection.execute(
			`SELECT resident_id FROM resident WHERE flat_id IN (${placeholders}) LIMIT 1`,
			flatIds
		);
		const [bills] = await connection.execute(
			`SELECT bill_id FROM maintenance_bill WHERE society_id=? AND flat_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...flatIds]
		);
		const [visitors] = await connection.execute(
			`SELECT visitor_id FROM community_visitor WHERE society_id=? AND flat_id IN (${placeholders}) LIMIT 1`,
			[societyId, ...flatIds]
		);
		if (residents.length || bills.length || visitors.length) {
			throw new Error("Generated units still have linked records. No units were deleted; review the links before cleanup.");
		}
		await connection.execute(
			"DELETE FROM flat WHERE society_id=? AND block='DEMO' AND flat_number LIKE 'DEMO-%'",
			[societyId]
		);
	}
}

async function seedRealisticData() {
	if (process.env.SEED_DEMO_DATA !== "YES") {
		throw new Error("Refusing to modify data. Set SEED_DEMO_DATA=YES to confirm this test-data operation.");
	}
	if (process.env.DB_NAME !== databaseName) {
		throw new Error(`Refusing to modify database "${process.env.DB_NAME || ""}". Expected the confirmed test database "${databaseName}".`);
	}
	if (!Number.isInteger(societyId) || societyId < 1) {
		throw new Error("SEED_SOCIETY_ID must be a positive integer.");
	}

	const connection = await db.getConnection();
	try {
		await connection.beginTransaction();
		const [societies] = await connection.execute(
			"SELECT society_id FROM society WHERE society_id=? FOR UPDATE",
			[societyId]
		);
		if (!societies.length) throw new Error(`Test society ${societyId} does not exist.`);

		await removePreviousSyntheticRows(connection);

		const [amenities] = await connection.execute(
			"SELECT amenity_id FROM amenity WHERE society_id=? AND status='Available' ORDER BY amenity_id",
			[societyId]
		);
		const [residents] = await connection.execute(
			`SELECT r.resident_id residentId,r.flat_id flatId
				FROM resident r JOIN flat f ON f.flat_id=r.flat_id
				WHERE f.society_id=? AND r.is_active=1 ORDER BY r.resident_id`,
			[societyId]
		);
		const [flats] = await connection.execute(
			"SELECT flat_id flatId FROM flat WHERE society_id=? ORDER BY flat_id",
			[societyId]
		);
		if (!amenities.length || !residents.length || !flats.length) {
			throw new Error("This community needs at least one active amenity, resident, and unit before sample activity can be added.");
		}

		const bookings = [
			[0, 0, -3, 10, "Completed", "Family swim session"],
			[1, 1, -2, 18, "Completed", "Badminton court reservation"],
			[2, 2, 2, 9, "Confirmed", "Morning fitness class"],
			[0, 3, 3, 17, "Confirmed", "Weekend pool reservation"],
			[3, 4, 5, 14, "Pending", "Guest room reservation"],
			[1, 5, 7, 19, "Pending", "Evening badminton session"],
		].map(([amenityIndex, residentIndex, dayOffset, hour, status, notes]) => {
			const start = dateOffset(dayOffset, hour);
			return [
				societyId,
				residents[residentIndex % residents.length].residentId,
				amenities[amenityIndex % amenities.length].amenity_id,
				sqlDate(start),
				sqlDate(new Date(start.getTime() + 60 * 60 * 1000)),
				`[Sample] ${notes}`,
				status,
			];
		});
		await insertRows(connection, "amenity_booking", ["society_id","resident_id","amenity_id","start_at","end_at","notes","status"], bookings);

		const complaints = [
			[0, "Lift door is slow to close in Block B", "Lift", "The lift door on the second floor is taking several seconds to close. Please arrange an inspection.", "Medium", "In Progress"],
			[1, "Water pressure is low on upper floors", "Plumbing", "Residents on the top floors have reported low water pressure during the morning peak.", "Medium", "Open"],
			[2, "Hallway light needs replacement", "Electrical", "The corridor light near the stairwell is not working.", "Low", "Open"],
			[3, "Waste collection missed this morning", "Cleaning", "The scheduled waste collection did not reach our block today.", "Low", "Resolved"],
			[4, "Please inspect the play-area gate", "Other", "The latch on the garden play-area gate feels loose and may need adjustment.", "High", "In Progress"],
		].map(([residentIndex, subject, category, description, priority, status]) => [
			societyId,
			residents[residentIndex % residents.length].residentId,
			`[Sample] ${subject}`,
			category,
			description,
			priority,
			status,
		]);
		await insertRows(connection, "community_complaint", ["society_id","resident_id","subject","category","description","priority","status"], complaints);

		const notices = [
			["Water-tank cleaning schedule", "Water-tank cleaning is scheduled for Saturday from 10:00 AM to 1:00 PM. Please store any water you may need during this period.", "All Residents"],
			["Waste segregation reminder", "Please separate wet and dry waste and place it at the collection point before 9:00 AM each day.", "All Residents"],
			["Community meeting", "Residents are invited to the monthly community meeting in the clubhouse on Sunday at 11:00 AM.", "All Residents"],
		].map(([title, description, audience]) => [
			societyId,
			`[Sample] ${title}`,
			description,
			audience,
			"Published",
			new Date(),
			null,
		]);
		await insertRows(connection, "community_notice", ["society_id","title","description","audience","status","published_at","created_by"], notices);

		const visitors = [
			[0, "Ananya Mehta", "Family visit", -1, "Checked Out"],
			[1, "Kabir Shah", "Food delivery", -1, "Checked Out"],
			[2, "Mira Desai", "Plumbing service appointment", 0, "Expected"],
			[3, "Arjun Patel", "Guest visit", 1, "Expected"],
			[4, "Nisha Rao", "Furniture delivery", 2, "Expected"],
			[5, "Dev Malhotra", "Electrical service appointment", 3, "Expected"],
		].map(([residentIndex, visitorName, purpose, dayOffset, status], index) => {
			const flatId = residents[residentIndex % residents.length].flatId;
			if (!flats.some((flat) => Number(flat.flatId) === Number(flatId))) {
				throw new Error("Sample visitor flat does not belong to the selected community.");
			}
			const expectedAt = dateOffset(dayOffset, 11 + (index % 6));
			const checkedInAt = status === "Checked Out"
				? sqlDate(new Date(expectedAt.getTime() + 5 * 60 * 1000))
				: null;
			const checkedOutAt = status === "Checked Out"
				? sqlDate(new Date(expectedAt.getTime() + 35 * 60 * 1000))
				: null;
			return [
				societyId,
				flatId,
				residents[residentIndex % residents.length].residentId,
				`[Sample] ${visitorName}`,
				null,
				purpose,
				sqlDate(expectedAt),
				checkedInAt,
				checkedOutAt,
				status,
			];
		});
		await insertRows(connection, "community_visitor", ["society_id","flat_id","resident_id","visitor_name","phone","purpose","expected_at","checked_in_at","checked_out_at","status"], visitors);

		const [summary] = await connection.execute(
			`SELECT
				(SELECT COUNT(*) FROM flat WHERE society_id=?) flats,
				(SELECT COUNT(*) FROM resident r JOIN flat f ON f.flat_id=r.flat_id WHERE f.society_id=?) residents,
				(SELECT COUNT(*) FROM amenity WHERE society_id=?) amenities,
				(SELECT COUNT(*) FROM amenity_booking WHERE society_id=?) bookings,
				(SELECT COUNT(*) FROM maintenance_bill WHERE society_id=?) bills,
				(SELECT COUNT(*) FROM community_complaint WHERE society_id=?) complaints,
				(SELECT COUNT(*) FROM community_notice WHERE society_id=?) notices,
				(SELECT COUNT(*) FROM community_visitor WHERE society_id=?) visitors`,
			Array(8).fill(societyId)
		);
		await connection.commit();
		console.log(`Removed only previously generated bulk demo rows and added a small realistic sample set in society ${societyId}.`);
		console.log("Final community row totals:", JSON.stringify(summary[0]));
		console.log("Added 6 bookings, 5 complaints, 3 notices, and 6 visitor examples. Existing units, residents, amenities, bills, and payment records were preserved.");
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

(async () => {
	try {
		await seedRealisticData();
	} catch (error) {
		console.error("Realistic sample-data update failed:", error.message);
		process.exitCode = 1;
	} finally {
		if (typeof db.end === "function") await db.end();
	}
})();
