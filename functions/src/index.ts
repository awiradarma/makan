import * as admin from "firebase-admin";

admin.initializeApp();

export { emailWebhook } from "./emailWebhook";
export { parseReceiptPhoto } from "./photoParser";
