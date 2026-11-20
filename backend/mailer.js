const nodemailer = require("nodemailer");

function mailTransport() {
	const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
	if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) return null;
	return nodemailer.createTransport({
		host: SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: process.env.SMTP_SECURE === "true",
		auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
	});
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
	})[character]);
}

async function sendPasswordResetEmail(email, link, setup = false) {
	const transport = mailTransport();
	if (!transport) return false;
	const intro = setup
		? "A resident added you to their Nestora Residential Management community."
		: "We received a request to reset the password associated with your Nestora Residential Management account.";
	await transport.sendMail({
		from: process.env.SMTP_FROM,
		to: email,
		subject: setup ? "Set up your Nestora Tenant account" : "Reset your Nestora Residential Management password",
		text: `Dear User,\n\n${intro}\n\nTo create a new password, please click the link below:\n\nReset Your Password: ${link}\n\nThis password reset link is valid for 30 minutes and can only be used once.\n\nIf you did not request a password reset, please ignore this email. Your account will remain secure, and no changes will be made.\n\nIf you need assistance, please contact your community administrator.\n\nBest regards,\nNestora Residential Management Team\nSimplifying Residential Living`,
		html: `<p>Dear User,</p><p>${escapeHtml(intro)}</p><p>To create a new password, please click the link below:</p><p><a href="${escapeHtml(link)}"><strong>Reset Your Password</strong></a></p><p>This password reset link is valid for <strong>30 minutes</strong> and can only be used once.</p><p>If you did not request a password reset, please ignore this email. Your account will remain secure, and no changes will be made.</p><p>If you need assistance, please contact your community administrator.</p><p>Best regards,<br><strong>Nestora Residential Management Team</strong><br><em>Simplifying Residential Living</em></p>`,
	});
	return true;
}

async function sendTenantWelcomeEmail({ to, tenantName, societyName, block, flat, setupLink }) {
	const transport = mailTransport();
	if (!transport) return false;
	const location = `${block} · ${flat}`;
	await transport.sendMail({
		from: process.env.SMTP_FROM,
		to,
		subject: `Congratulations, ${tenantName} — you have been added to ${societyName}`,
		text: `Congratulations ${tenantName},\n\nYou have been added to ${societyName}, ${location}.\n\nSet up your Nestora tenant account and choose a password using this secure link:\n${setupLink}\n\nThe link expires in 30 minutes and can only be used once. Please contact your resident or community manager if you have questions.\n\nNestora Residential Management Team`,
		html: `<p>Congratulations <strong>${escapeHtml(tenantName)}</strong>,</p><p>You have been added to <strong>${escapeHtml(societyName)}</strong>, ${escapeHtml(location)}.</p><p>Set up your Nestora tenant account and choose a password using this secure link:</p><p><a href="${escapeHtml(setupLink)}"><strong>Set up my account</strong></a></p><p>This link expires in 30 minutes and can only be used once.</p><p>Please contact your resident or community manager if you have questions.</p><p>Nestora Residential Management Team</p>`,
	});
	return true;
}

async function sendResidentTenantAddedEmail({ to, residentName, tenantName, tenantEmail, tenantPhone, societyName, block, flat, moveIn, moveOut, emergencyContact, familyMembers, vehicleRegistration, status }) {
	const transport = mailTransport();
	if (!transport) return false;
	const details = [
		["Tenant", tenantName],
		["Email", tenantEmail],
		["Phone", tenantPhone],
		["Society", societyName],
		["Flat", `${block} · ${flat}`],
		["Move-in", moveIn],
		["Move-out", moveOut || "Not specified"],
		["Emergency contact", emergencyContact || "Not specified"],
		["Family members", familyMembers ?? "Not specified"],
		["Vehicle registration", vehicleRegistration || "Not specified"],
		["Status", status],
	];
	const textDetails = details.map(([label, value]) => `${label}: ${value}`).join("\n");
	const htmlDetails = details.map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join("");
	await transport.sendMail({
		from: process.env.SMTP_FROM,
		to,
		subject: `Tenant added to ${societyName}: ${tenantName}`,
		text: `Dear ${residentName},\n\nA tenant was added to your flat. Here are the tenant details:\n\n${textDetails}\n\nNestora Residential Management Team`,
		html: `<p>Dear ${escapeHtml(residentName)},</p><p>A tenant was added to your flat. Here are the tenant details:</p><ul>${htmlDetails}</ul><p>Nestora Residential Management Team</p>`,
	});
	return true;
}

async function sendManagerMessageEmail({ to, managerName, societyName, subject, body, eventAt, eventLocation, eventInvitation = false }) {
	const transport = mailTransport();
	if (!transport) return false;
	const eventDetails = eventInvitation
		? `\n\nEvent date and time: ${new Date(eventAt).toLocaleString()}\nVenue: ${eventLocation}`
		: "";
	const safeEventDetails = eventInvitation
		? `<p><strong>Date and time:</strong> ${escapeHtml(new Date(eventAt).toLocaleString())}<br><strong>Venue:</strong> ${escapeHtml(eventLocation)}</p>`
		: "";
	await transport.sendMail({
		from: process.env.SMTP_FROM,
		to,
		subject: `${eventInvitation ? "Event invitation" : "Manager message"}: ${subject}`,
		text: `${managerName} from ${societyName} ${eventInvitation ? "sent an event invitation to" : "sent a message to"} the platform administrator.\n\n${subject}${eventDetails}\n\n${body}`,
		html: `<p><strong>${escapeHtml(managerName)}</strong> from <strong>${escapeHtml(societyName)}</strong> ${eventInvitation ? "invited you to a community event." : "sent a message to the platform administrator."}</p><h2>${escapeHtml(subject)}</h2>${safeEventDetails}<p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p>`,
	});
	return true;
}

async function sendAdminReplyEmail({ to, adminName, managerName, societyName, subject, body }) {
	const transport = mailTransport();
	if (!transport) return false;
	await transport.sendMail({
		from: process.env.SMTP_FROM,
		to,
		subject: `Platform administrator reply: ${subject}`,
		text: `Dear ${managerName},\n\n${adminName} from Nestora replied to your message about ${societyName}.\n\n${subject}\n\n${body}`,
		html: `<p>Dear ${escapeHtml(managerName)},</p><p><strong>${escapeHtml(adminName)}</strong> from Nestora replied to your message about <strong>${escapeHtml(societyName)}</strong>.</p><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p>`,
	});
	return true;
}

module.exports = {
	mailTransport,
	sendPasswordResetEmail,
	sendTenantWelcomeEmail,
	sendResidentTenantAddedEmail,
	sendManagerMessageEmail,
	sendAdminReplyEmail,
};
