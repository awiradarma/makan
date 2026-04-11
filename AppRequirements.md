App Requirements: Family Food Vault (Multi-Profile)
1. Project Overview
A multi-profile food tracking application designed to manage meal rotations and preferences. It supports automated data entry via Email Forwarding (for digital receipts like GrabFood) and Image Uploads (for physical restaurant receipts).

2. Updated Architecture & Capabilities
Multi-Profile Support: Users can toggle between "Parents (Indonesia)" and "My Family (Local)."

Multimodal Ingestion:
- Email: Inbound webhook for forwarded receipts.
- Camera/Upload: A mobile-friendly UI to snap a photo of a physical receipt.
- Unified AI Parser: Gemini-powered OCR and structured data extraction.
- Currency/Locale Awareness: Automatically detects IDR (Rp) or USD ($).

3. Revised Data Schema (Firestore)
- profiles (Collection): label, default_currency, timezone, inbound_token, family_members.
- restaurants (Collection): profile_id, name, is_disliked, tags, last_ordered_at, address, lat, lng, faved_by, disliked_by.
- orders (Collection): profile_id, order_type, image_url, items, total_amount, status.
- food_items (Collection): profile_id, restaurant_id, name, rating, member_ratings (Map), tags, order_count.

4. Key Functional Requirements
- 4.1 Multimodal Parser: Accepts text (email) or image (photo) and returns structured JSON.
- 4.2 Profile-Based View: Top Bar switcher for profiles and family members.
- 4.3 Detailed Search: "When was the last time we had [Food Item]?" and Spending Trends.

5. UI/UX Requirements
- Quick-Add FAB: Snap photo or manual entry.
- Review Screen: Verify AI extraction before saving.
- Mobile PWA: Standalone experience with custom app icon.
- Offline-First: Firestore Persistence (IndexedDB) enabled.

6. Implementation Phases

Phase 1: Foundation & Data Enrichment [x]
- UI Polish, Tagging Engine, Geolocation & Migration.

Phase 2: Personnel, Profiles & UI Expansion [x]
- Family Members, Member Switcher, Individual Preferences, Theme Toggle.

Phase 3: Knowledge & Decision Support [/]
- Food Library (Restaurant/Item views, personal ratings). [x]
- Sunday Tradition (Interactive Canvas spinning wheel). [x]
- Offline Performance (IndexedDB). [x]
- Smart Suggestions (Proximity-based recommendations). [ ]