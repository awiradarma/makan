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
    console.log("Incoming Webhook Headers:", JSON.stringify(req.headers));
    console.log("Incoming Webhook Body:", JSON.stringify(req.body));

    try {
      // 1. Verify Signature (now optional)
      const signature = req.headers["x-webhook-signature"];
      const secret = process.env.FORWARD_EMAIL_WEBHOOK_SECRET;

      if (secret) {
        if (!signature) {
          console.error("Missing signature header but secret is configured");
          res.status(401).send("Unauthorized: Missing signature");
          return;
        }

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

      // ForwardEmail.net JSON payload structure:
      // text, html, headers.to, headers.from, headers.subject
      const toAddress = body.headers?.to || "";
      const fromAddress = body.headers?.from || "";
      const subject = body.subject || body.headers?.subject || "";
      const textBody = body.text || body.html || "";

      if (!toAddress) {
        console.error("Missing recipient (To) address");
        res.status(400).send("Invalid email: missing recipient");
        return;
      }

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
      await db.collection("orders").add({
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

      console.log(
        `Parsed email for profile ${profileId}: ${parsed.restaurant_name}`
      );
      res.status(200).send("OK");
    } catch (error) {
      console.error("Email webhook error:", error);
      res.status(500).send("Internal error");
    }
  }
);

