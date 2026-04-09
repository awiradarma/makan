import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { parseReceiptFromImage, type ParsedReceipt } from "./parser";

interface ParsePhotoRequest {
  base64_image: string;
  profile_id: string;
  mime_type?: string;
}

/**
 * Callable Cloud Function to parse a receipt photo.
 * Called from the frontend after the user uploads/takes a photo.
 * Returns parsed receipt data for the user to review before saving.
 */
export const parseReceiptPhoto = onCall(
  { secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    // Verify auth
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    // Debug: log secret availability
    const hasKey = !!process.env.GEMINI_API_KEY;
    console.log(`GEMINI_API_KEY available: ${hasKey}, length: ${process.env.GEMINI_API_KEY?.length || 0}`);

    const { base64_image, profile_id, mime_type } =
      request.data as ParsePhotoRequest;

    if (!base64_image || !profile_id) {
      throw new HttpsError(
        "invalid-argument",
        "base64_image and profile_id are required"
      );
    }

    console.log(`Parsing photo for profile: ${profile_id}, image size: ${base64_image.length} chars`);

    const db = admin.firestore();

    // Verify the user has access to this profile
    const profileDoc = await db.collection("profiles").doc(profile_id).get();
    if (!profileDoc.exists) {
      throw new HttpsError("not-found", "Profile not found");
    }

    const profileData = profileDoc.data()!;
    if (!profileData.members?.includes(request.auth.uid)) {
      throw new HttpsError(
        "permission-denied",
        "Not a member of this profile"
      );
    }

    // Reference date
    const tz = profileData.timezone || "America/Chicago";
    let referenceDate: string;
    try {
      referenceDate = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    } catch {
      referenceDate = new Date().toISOString().split("T")[0];
    }

    try {
      const parsed: ParsedReceipt = await parseReceiptFromImage(
        base64_image,
        mime_type || "image/jpeg",
        referenceDate
      );

      console.log(`Successfully parsed: ${parsed.restaurant_name}`);
      return parsed;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : "";
      console.error("Photo parse error:", errMsg);
      console.error("Stack:", errStack);
      throw new HttpsError("internal", `Failed to parse receipt image: ${errMsg}`);
    }
  }
);
