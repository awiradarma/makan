import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { parseReceiptFromText } from "./parser";

/**
 * HTTP endpoint for SendGrid Inbound Parse webhook.
 *
 * SendGrid POSTs multipart/form-data with fields:
 * - to: recipient email
 * - from: sender email
 * - subject: email subject
 * - text: plain text body
 * - html: HTML body
 */
export const emailWebhook = onRequest(
  { secrets: ["GEMINI_API_KEY", "FORWARD_EMAIL_WEBHOOK_SECRET"], invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const db = admin.firestore();

    try {
      // 1. Verify Signature (now optional)
      const signature = req.headers["x-webhook-signature"];
      const secret = process.env.FORWARD_EMAIL_WEBHOOK_SECRET;

      if (secret && signature) {
        if (!req.rawBody) {
          console.error("Missing rawBody for verification");
          res.status(400).send("Bad Request: Missing rawBody");
          return;
        }

        const hmac = crypto.createHmac("sha256", secret);
        const digest = hmac.update(req.rawBody).digest("hex");

        if (signature !== digest) {
          console.error("Invalid signature");
          res.status(401).send("Unauthorized: Invalid signature");
          return;
        }
        console.log("Signature verified successfully");
      } else if (secret && !signature) {
        console.warn(
          "FORWARD_EMAIL_WEBHOOK_SECRET is set but X-Webhook-Signature header is missing. Skipping verification for now."
        );
      } else {
        console.warn(
          "FORWARD_EMAIL_WEBHOOK_SECRET is not set. Skipping signature verification."
        );
      }

      // 2. Parse Webhook Data (ForwardEmail sends JSON by default)
      const body = req.body;
      if (!body || typeof body !== "object") {
        console.error("Invalid body format");
        res.status(400).send("Invalid body");
        return;
      }

      // ForwardEmail.net JSON payload structure is flexible.
      // We check for both lowercase and capitalized keys.
      const headers = body.headers || {};

      // Helper to extract string from header value (which can be string or object)
      const getString = (val: any): string => {
        if (!val) return "";
        if (typeof val === "string") return val;
        if (typeof val === "object") {
          // mailparser style: { value: [...], html: "...", text: "..." }
          if (val.text) return val.text;
          if (val.value && Array.isArray(val.value) && val.value[0]?.address) {
            return val.value[0].address;
          }
        }
        return String(val);
      };

      const messageId = getString(
        body.messageId ||
        headers.messageId ||
        headers["message-id"] ||
        headers["Message-ID"]
      );

      if (messageId) {
        const processedRef = db.collection("processed_emails").doc(messageId);
        const processedDoc = await processedRef.get();
        if (processedDoc.exists) {
          console.log(`Email already processed: ${messageId}. Skipping.`);
          res.status(200).send("OK (Duplicate)");
          return;
        }
      }

      const toAddress = getString(
        body.to ||
        headers.to ||
        headers.To ||
        headers["X-Original-To"]
      );
      const fromAddress = getString(
        body.from ||
        headers.from ||
        headers.From
      );
      const subject = getString(
        body.subject ||
        headers.subject ||
        headers.Subject
      );
      const textBody =
        body.text ||
        body.html ||
        headers.text ||
        "";

      if (!toAddress) {
        console.error("Missing recipient (To) address");
        res.status(400).send("Invalid email: missing recipient");
        return;
      }

      console.log(`Processing email to: ${toAddress}, from: ${fromAddress}, Message-ID: ${messageId}`);

      // Extract token from recipient: token@inbound.domain.com or Name <token@inbound.domain.com>
      const tokenMatch = toAddress.match(/(?:<|^)([^@<>\s]+)@/);
      if (!tokenMatch) {
        console.error("Could not extract token from:", toAddress);
        res.status(400).send("Invalid recipient");
        return;
      }
      const token = tokenMatch[1].toLowerCase().trim();

      // Look up profile by inbound_token
      const profileSnap = await db
        .collection("profiles")
        .where("inbound_token", "==", token)
        .limit(1)
        .get();

      if (profileSnap.empty) {
        console.error("No profile found for token:", token);
        res.status(404).send("Profile not found");
        return;
      }

      const profileDoc = profileSnap.docs[0];
      const profileId = profileDoc.id;
      const profileData = profileDoc.data();

      // Reference date for the parser
      const tz = profileData.timezone || "America/Chicago";
      let referenceDate: string;
      try {
        referenceDate = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      } catch {
        referenceDate = new Date().toISOString().split("T")[0];
      }

      // Parse the receipt with Gemini
      const parsed = await parseReceiptFromText(textBody, referenceDate);

      // Determine the order date
      const orderedAt = parsed.date
        ? admin.firestore.Timestamp.fromDate(new Date(parsed.date))
        : admin.firestore.Timestamp.now();

      // Save the order
      const orderRef = await db.collection("orders").add({
        profile_id: profileId,
        restaurant_name: parsed.restaurant_name,
        restaurant_address: parsed.restaurant_address || null,
        order_type: "Email",
        image_url: null,
        items: parsed.items,
        total_amount: parsed.total_amount,
        currency: parsed.currency,
        ordered_at: orderedAt,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending_review",
        // Store email metadata for reference
        email_metadata: {
          from: fromAddress,
          subject: subject,
          message_id: messageId,
        },
      });

      // Upsert restaurant
      const restKey = `${profileId}_${parsed.restaurant_name.toLowerCase().trim()}`;
      const restRef = db.collection("restaurants").doc(restKey);
      const restSnap = await restRef.get();

      if (restSnap.exists) {
        const data = restSnap.data()!;
        await restRef.update({
          last_ordered_at: orderedAt,
          order_count: (data.order_count || 0) + 1,
          address: parsed.restaurant_address || data.address || null,
        });
      } else {
        await restRef.set({
          profile_id: profileId,
          name: parsed.restaurant_name,
          address: parsed.restaurant_address || null,
          is_disliked: false,
          tags: [],
          last_ordered_at: orderedAt,
          order_count: 1,
        });
      }

      // Record as processed for idempotency
      if (messageId) {
        await db.collection("processed_emails").doc(messageId).set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          order_id: orderRef.id,
          profile_id: profileId,
        });
      }

      console.log(
        `Parsed email for profile ${profileId}: ${parsed.restaurant_name} (Order: ${orderRef.id})`
      );
      res.status(200).send("OK");
    } catch (error) {
      console.error("Email webhook error:", error);
      res.status(500).send("Internal error");
    }
  }
);

