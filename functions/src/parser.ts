import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ParsedReceipt {
  restaurant_name: string;
  restaurant_address: string | null;
  restaurant_tags: string[];
  date: string;
  items: Array<{ name: string; price: number; tags: string[] }>;
  total_amount: number;
  currency: "USD" | "IDR";
}

const SYSTEM_PROMPT = `You are a receipt parser. Extract structured data from food order receipts.
Return ONLY valid JSON with this exact schema:
{
  "restaurant_name": "string",
  "restaurant_address": "string or null",
  "restaurant_tags": ["string"],
  "date": "YYYY-MM-DD",
  "items": [{"name": "string", "price": number, "tags": ["string"]}],
  "total_amount": number,
  "currency": "USD" or "IDR"
}

Rules:
- If you see "Rp", "IDR", or Indonesian-style pricing (e.g., 25.000), use "IDR"
- If you see "$", "USD", or standard decimal pricing, use "USD"
- For IDR, prices should be whole numbers (e.g., 25000 not 25.000)
- Use the reference date provided to interpret relative dates like "Today", "Yesterday", "Sunday"
- If a photo, ignore background noise and focus only on the receipt
- If date cannot be determined, use the reference date
- Meticulously look for the restaurant's physical address (street name, city, etc.) and include it in "restaurant_address". If absolutely not found, use null.
- Identify the cuisine type (e.g., "Thai", "Mexican", "Italian", "Coffee") from the restaurant name and items, and add it to "restaurant_tags" (without #).
- If specific food item characteristics are obvious (e.g., "spicy", "dessert", "drinks", "vegan"), add them to the item's "tags" list.
- Return ONLY the JSON object, no markdown formatting, no code blocks`;

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

export async function parseReceiptFromText(
  textBody: string,
  referenceDate: string
): Promise<ParsedReceipt> {
  const model = getModel();
  const prompt = `${SYSTEM_PROMPT}\n\nReference date (today): ${referenceDate}\n\nReceipt text:\n${textBody}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  console.log(`Gemini response: ${text}`);

  try {
    const jsonStr = text.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(jsonStr) as ParsedReceipt;
    console.log("Parsed result:", JSON.stringify(parsed));
    return parsed;
  } catch (err) {
    console.error("Failed to parse Gemini response:", text);
    throw new Error("Failed to extract structured data from receipt");
  }
}

export async function parseReceiptFromImage(
  base64Image: string,
  mimeType: string,
  referenceDate: string
): Promise<ParsedReceipt> {
  const model = getModel();
  const prompt = `${SYSTEM_PROMPT}\n\nReference date (today): ${referenceDate}`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType || "image/jpeg",
      },
    },
  ]);
  const text = result.response.text().trim();
  console.log(`Gemini image response: ${text}`);

  try {
    const jsonStr = text.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(jsonStr) as ParsedReceipt;
    console.log("Parsed result:", JSON.stringify(parsed));
    return parsed;
  } catch (err) {
    console.error("Failed to parse Gemini response:", text);
    throw new Error("Failed to extract structured data from receipt image");
  }
}
