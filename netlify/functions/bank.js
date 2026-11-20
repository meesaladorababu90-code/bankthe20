// netlify/functions/bank.js
// Serverless bridge between The ₹20 Bank frontend and JSONBin.io
// Reads JSONBIN_BIN_ID, JSONBIN_MASTER_KEY, and OWNER_PIN from Netlify Environment Variables.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-owner-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async function (event) {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const binId = process.env.JSONBIN_BIN_ID;
  const masterKey = process.env.JSONBIN_MASTER_KEY;
  const ownerPin = process.env.OWNER_PIN;

  if (!binId || !masterKey || !ownerPin) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Missing JSONBIN_BIN_ID, JSONBIN_MASTER_KEY, or OWNER_PIN in Netlify environment variables.",
      }),
    };
  }

  const jsonBinUrl = `https://api.jsonbin.io/v3/b/${binId}`;

  // GET: Public read-only fetch for all viewers & owner
  if (event.httpMethod === "GET") {
    try {
      const response = await fetch(`${jsonBinUrl}/latest`, {
        method: "GET",
        headers: {
          "X-Master-Key": masterKey,
          "X-Bin-Meta": "false",
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          statusCode: response.status,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Failed to read from JSONBin", details: errText }),
        };
      }

      const data = await response.json();
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          friends: Array.isArray(data.friends) ? data.friends : [],
          history: Array.isArray(data.history) ? data.history : [],
        }),
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Network error reaching JSONBin", details: err.message }),
      };
    }
  }

  // POST: Owner-only write (verifies PIN server-side before updating JSONBin)
  if (event.httpMethod === "POST") {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid JSON request body." }),
      };
    }

    const submittedPin = String(event.headers["x-owner-pin"] || body.pin || "").trim();

    // Allow a lightweight PIN verification check without overwriting data
    if (body.action === "verify_pin") {
      if (submittedPin === String(ownerPin).trim()) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, message: "PIN verified" }),
        };
      }
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: "Incorrect Owner PIN." }),
      };
    }

    if (submittedPin !== String(ownerPin).trim()) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Unauthorized: Invalid Owner PIN." }),
      };
    }

    const payload = body.data || body;
    const cleanPayload = {
      friends: Array.isArray(payload.friends) ? payload.friends : [],
      history: Array.isArray(payload.history) ? payload.history : [],
      updatedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch(jsonBinUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": masterKey,
        },
        body: JSON.stringify(cleanPayload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          statusCode: response.status,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Failed to save to JSONBin", details: errText }),
        };
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, data: cleanPayload }),
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Network error saving to JSONBin", details: err.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: "Method Not Allowed" }),
  };
};
