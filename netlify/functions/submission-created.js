// netlify/functions/submission-created.js
import sg from "@sendgrid/mail";

// --- Configuration ---
// Ensure your environment variables are set in the Netlify UI:
// SENDGRID_API_KEY: Your SendGrid API key.
// FROM_EMAIL: A verified sender email address in your SendGrid account.
// TO_EMAIL: A comma-separated list of recipient email addresses.
const TO_EMAILS = (process.env.TO_EMAIL || "steve@quirkcars.com").split(',');
const FROM_EMAIL = process.env.FROM_EMAIL;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

sg.setApiKey(SENDGRID_API_KEY || "");

/**
 * Main function handler for the 'submission-created' event.
 */
export async function handler(event) {
  // 1. Check for required configuration
  if (!SENDGRID_API_KEY || !FROM_EMAIL || TO_EMAILS.length === 0) {
    console.error("Missing required environment variables (SENDGRID_API_KEY, FROM_EMAIL, TO_EMAIL).");
    return {
      statusCode: 500,
      body: "Server configuration error: Missing API keys or email configuration.",
    };
  }

  // 2. Safely parse the incoming submission data
  let payload;
  try {
    payload = JSON.parse(event.body || "{}").payload || {};
  } catch (error) {
    console.error("Invalid webhook payload:", error);
    return { statusCode: 400, body: "Invalid webhook payload" };
  }

  const data = payload.data || {};
  const files = payload.files || [];

  // 3. Generate email content from form data
  const { subject, htmlBody, textBody } = createEmailContent(data);

  // 4. Process and fetch file attachments
  let attachments = [];
  if (files.length > 0) {
    try {
      attachments = await processAttachments(files);
    } catch (error) {
      console.error("Failed to process attachments:", error);
      // Continue without attachments if fetching fails
    }
  }

  const filesHtml = files.length > 0
    ? `<ul>${files.map(f => `<li><a href="${f.url}">${f.filename || f.url}</a></li>`).join("")}</ul>`
    : `<p>No photos uploaded.</p>`;

  // 5. Send the email using SendGrid
  try {
    await sg.send({
      to: TO_EMAILS,
      from: FROM_EMAIL,
      subject,
      text: `${textBody}\n\nPhotos:\n${files.map(f => f.url).join("\n") || "No photos uploaded."}`,
      html: `${htmlBody}<h3 style="margin-top:16px;">Photos</h3>${filesHtml}`,
      attachments: attachments.length ? attachments : undefined,
    });
  } catch (error) {
    console.error("SendGrid API Error:", JSON.stringify(error.response?.body || error.message, null, 2));
    return { statusCode: 502, body: "Failed to send email via provider." };
  }

  // 6. (Optional) Trigger backup webhook
  await triggerBackupWebhook(data, files);

  return { statusCode: 200, body: "ok" };
}

/**
 * Creates the subject, HTML body, and text body for the email.
 * - Omits internal/hidden fields
 * - Uses friendly labels
 * - Renders in a fixed order
 */
function createEmailContent(data) {
  // Fields we never want to show in notifications
  const OMIT = new Set([
    "form-name", "company", "bot-field", "honeypot", // honeypots
    "agree", "fieldOrder", "phoneRaw",               // UI/internal helpers
    "referrer", "landingPage",                       // tracking
    "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent" // UTMs
  ]);

  // Friendly labels
  const LABELS = {
    name: "Full Name",
    email: "Email Address",
    salesConsultant: "Sales Consultant",
    phone: "Phone Number",

    vin: "VIN",
    mileage: "Mileage",
    year: "Year",
    make: "Make",
    model: "Model",
    trim: "Trim",

    extColor: "Exterior Color",
    intColor: "Interior Color",
    keys: "Number of Keys",
    title: "Title Status",
    owners: "Number of Owners",

    accident: "Accident",
    accidentRepair: "Accident Repair",
    warnings: "Warning Lights",

    mech: "Mechanical Issues",
    cosmetic: "Cosmetic Issues",
    interior: "Interior Condition",
    mods: "Aftermarket Parts / Mods",
    smells: "Unusual Smells",
    service: "Routine Services",

    tires: "Tires",
    brakes: "Brakes",
    wear: "Other Wear Items"
  };

  // Preferred fixed order for rows
  const ORDER = [
    // Contact
    "name", "email", "salesConsultant", "phone",
    // Vehicle basics
    "vin", "mileage", "year", "make", "model", "trim",
    // Appearance
    "extColor", "intColor",
    // Ownership & title
    "keys", "title", "owners",
    // Accidents & warnings
    "accident", "accidentRepair", "warnings",
    // Condition
    "mech", "cosmetic", "interior", "mods", "smells", "service",
    // Wearables
    "tires", "brakes", "wear"
  ];

  const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== "";

  const rows = [];

  // 1) Add known fields in fixed order
  for (const key of ORDER) {
    if (key in data && !OMIT.has(key) && hasVal(data[key])) {
      const val = Array.isArray(data[key]) ? data[key].join(", ") : String(data[key]);
      rows.push([LABELS[key] || key, val]);
    }
  }

  // 2) Append any extra fields that slipped in (but aren't omitted), sorted by key
  const known = new Set(ORDER);
  Object.keys(data)
    .filter(k => !known.has(k) && !OMIT.has(k) && hasVal(data[k]))
    .sort()
    .forEach(k => {
      const v = Array.isArray(data[k]) ? data[k].join(", ") : String(data[k]);
      rows.push([LABELS[k] || k, v]);
    });

  // HTML/text render
  const htmlEscape = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const htmlBody = `
    <h2 style="margin:0 0 6px 0;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">New Trade-In Lead</h2>
    <div style="margin:0 0 12px 0;color:#334155;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
      ${(data.year || "")} ${(data.make || "")} ${(data.model || "")}
    </div>
    <table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;">
      ${rows.map(([label, val]) => `
        <tr>
          <th align="left" style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:14px;color:#111827;padding:6px 10px 6px 0;">${htmlEscape(label)}</th>
          <td style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:14px;color:#111827;padding:6px 0;">${htmlEscape(val)}</td>
        </tr>
      `).join("")}
    </table>
  `;

  const textBody = rows.map(([label, val]) => `${label}: ${val}`).join("\n");

  // Subject: include name when present
  const subject = `New Trade-In Lead – ${data.name ? `${data.name} – ` : ""}${(data.year || "")} ${(data.make || "")} ${(data.model || "")}`
    .replace(/\s+/g, " ")
    .trim();

  return { subject, htmlBody, textBody };
}

/**
 * Fetches uploaded files and prepares them for SendGrid attachments.
 * @param {Array<object>} files - Array of file objects from Netlify.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of SendGrid attachment objects.
 */
async function processAttachments(files) {
  const MAX_ATTACH = 10;
  const MAX_EACH_MB = 7;
  const MAX_TOTAL_MB = 20;

  const attachments = [];
  let totalSize = 0;

  const fetchPromises = files.slice(0, MAX_ATTACH).map(async (file) => {
    try {
      const response = await fetch(file.url);
      if (!response.ok) {
        console.warn(`Failed to fetch attachment from ${file.url}, status: ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const size = buffer.byteLength;

      if (size > MAX_EACH_MB * 1024 * 1024) {
        console.warn(`Skipping attachment ${file.filename} as it exceeds the ${MAX_EACH_MB}MB limit.`);
        return null;
      }
      if (totalSize + size > MAX_TOTAL_MB * 1024 * 1024) {
        console.warn(`Skipping attachment ${file.filename} as it would exceed the total ${MAX_TOTAL_MB}MB limit.`);
        return null;
      }
      totalSize += size;

      return {
        content: buffer.toString("base64"),
        filename: file.filename,
        type: file.type || "application/octet-stream",
        disposition: "attachment",
      };
    } catch (error) {
      console.error(`Error processing attachment ${file.url}:`, error);
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);
  return results.filter(Boolean);
}

/**
 * (Optional) Sends submission data to a backup service like Google Sheets.
 * @param {object} data - The form submission data.
 * @param {Array<object>} files - The array of file objects.
 */
async function triggerBackupWebhook(data, files) {
  if (!process.env.SHEETS_WEBHOOK_URL) return;

  try {
    const fileUrls = files.map(f => f.url);
    const lead = { ...data, fileUrls, _ts: new Date().toISOString() };
    const secret = process.env.SHEETS_SHARED_SECRET;
    let url = process.env.SHEETS_WEBHOOK_URL;
    if (secret) {
      url += `?secret=${encodeURIComponent(secret)}`;
    }

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });
  } catch (error) {
    console.warn("Backup webhook failed:", error);
  }
}
