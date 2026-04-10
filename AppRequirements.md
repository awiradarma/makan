App Requirements: Family Food Vault (Multi-Profile)
1. Project Overview
A multi-profile food tracking application designed to manage meal rotations and preferences. It supports automated data entry via Email Forwarding (for digital receipts like GrabFood) and Image Uploads (for physical restaurant receipts).

2. Updated Architecture & Capabilities
Multi-Profile Support: Users can toggle between "Parents (Indonesia)" and "My Family (Local)."

Multimodal Ingestion:

Email: Inbound webhook for forwarded receipts.

Camera/Upload: A mobile-friendly UI to snap a photo of a physical receipt.

Unified AI Parser: Both channels pipe data into a Gemini-powered Cloud Function that performs OCR and structured data extraction.

Currency/Locale Awareness: Automatically detects if a receipt is in IDR (Rp) or USD ($) based on the profile or receipt content.

3. Revised Data Schema (Firestore)
profiles (Collection)
id: String (e.g., "parents", "my-family")

label: String (e.g., "Parents in Bogor")

default_currency: String (USD/IDR)

timezone: String

restaurants (Collection)
profile_id: Reference (To separate parent's Bogor spots from your San Antonio spots)

name: String

is_disliked: Boolean

tags: Array (e.g., "Indonesian", "BBQ", "Healthy")

last_ordered_at: Timestamp

orders (Collection)
profile_id: Reference

order_type: String ("Email" or "Photo")

image_url: String (Link to Firebase Storage if a photo was taken)

items: Array of { name, price }

total_amount: Number

4. Key Functional Requirements
4.1 Multimodal Parser (The "Magic" Engine)
Logic: The Cloud Function should accept either a text_body (from email) or a base64_image (from a photo).

AI Prompt: "Extract the restaurant name, date, itemized list, and total from this [Email/Photo]. If it's a photo, ignore background noise and focus only on the receipt. Return valid JSON."

Storage: Photos of receipts should be saved to Firebase Storage and linked to the database record for future reference.

4.1.2 Inbound Email Routing Logic
Requirement: The system must support multiple inbound "Mailboxes."

Implementation: 
    1.  User creates a Profile (e.g., "Parents").
    2.  The system generates a unique Inbound Token (e.g., parents-123).
    3.  The user forwards receipts to [token]@inbound.myapp.com.
    4.  Cloud Function Logic:
```javascript
const recipient = mailJson.To; // e.g., parents-123@inbound.myapp.com
const token = recipient.split('@')[0];
const profile = await db.collection('profiles').where('inbound_token', '==', token).get();

  if (profile.exists) {
     // Proceed with Gemini parsing and save to this specific profile
  }
 ```

4.2 Profile-Based View
A dropdown at the top of the app to switch between "Parents" and "My Family."

Dashboard filters orders and "Rotation" recommendations based on the active profile.

4.3 Detailed Search & Analytics
Recency Query: "When was the last time we had [Food Item]?"

Trend Analysis: Spending summaries per profile.

5. UI/UX Requirements
Quick-Add Button: A prominent '+' button on the mobile web app with two options: "Upload Receipt Photo" or "Manual Entry."

Review Screen: After the AI parses a receipt (email or photo), show a "Confirm" screen where the user can quickly verify the items and the total before it’s saved.

Implementation Notes for the Agent:
Firebase Storage: You'll need to enable a storage bucket to hold the receipt images.

Gemini 1.5 Flash: Use this model specifically; it's extremely fast and cost-effective for OCR tasks on receipts.

Location Context: Ensure the parser uses the system date as a reference point for "Today" so it can correctly interpret relative dates on receipts (e.g., "Sunday" or "Yesterday").

6. Implementation Phases (New Features)

Phase 1: Foundation & Data Enrichment
1. UI Polish: Fix layout "wiggle" on mobile touch interactions (overscroll-behavior).
2. Tagging Engine:
   - Add `tags` to `food_items`.
   - UI: Enable tag editing for both Restaurants and Food Items.
   - Update AI Prompt: "Identify the cuisine type (e.g., #Thai, #Mexican) and add it as a tag."
3. Geolocation & Migration:
   - Add `lat` and `lng` to `restaurants`.
   - Migration Utility: Scan existing restaurants and calculate coordinates from their address.
   - Auto-Geocoding: Automatically calculate and store coordinates for new entries (OCR/Email/Form).

Phase 2: Personnel & Individual Preferences
1. Family Members:
   - Allow multiple "Member" labels under a single Profile (e.g., Papa, Mama, Kids).
   - Add an "Active Member" switcher in the UI.
2. Individual Preferences:
   - Track restaurant "Favorite" and "Disliked" status per individual member.

Phase 3: Proximity & Decision Support
1. Smart Suggestions: Recommend restaurants based on:
   - Current user proximity.
   - Active member's favorites.
   - Tags matching current cravings.
2. The Sunday Tradition: "Spinning Wheel" UI to randomly pick a place while honoring favorites and location.