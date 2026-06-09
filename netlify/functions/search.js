const { createClient } = require("@libsql/client");

let client = null;

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) {
      throw new Error("TURSO_DATABASE_URL environment variable is missing.");
    }
    client = createClient({ url, authToken });
  }
  return client;
}

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const query = (event.queryStringParameters && event.queryStringParameters.q || "").trim();
  if (!query) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        query: "",
        total_count: 0,
        top_users: [],
        trends: [],
        samples: []
      })
    };
  }

  try {
    const libsql = getClient();
    
    // 1. Fetch matching rows for user & date counts
    const messageResult = await libsql.execute({
      sql: `SELECT username, stream_date 
            FROM chat_messages_fts 
            WHERE message MATCH ? AND LOWER(username) NOT IN ('fossabot', 'streamelements')`,
      args: [query]
    });

    const rows = messageResult.rows;
    const total_count = rows.length;

    // JavaScript-side aggregation
    const userCounts = {};
    const dateCounts = {};

    for (let i = 0; i < rows.length; i++) {
      const username = rows[i].username;
      const streamDate = rows[i].stream_date;
      
      if (username) {
        userCounts[username] = (userCounts[username] || 0) + 1;
      }
      if (streamDate) {
        const dateStr = streamDate.substring(0, 10);
        dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
      }
    }

    // Compile Top 10 Users
    const top_users = Object.entries(userCounts)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Compile sorted Date Trends
    const trends = Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 2. Fetch latest 20 sample messages
    const samplesResult = await libsql.execute({
      sql: `SELECT username, message, timestamp, stream_title 
            FROM chat_messages_fts 
            WHERE message MATCH ? AND LOWER(username) NOT IN ('fossabot', 'streamelements')
            ORDER BY timestamp DESC 
            LIMIT 20`,
      args: [query]
    });

    const samples = samplesResult.rows.map(row => ({
      username: row.username,
      message: row.message,
      timestamp: row.timestamp,
      stream_title: row.stream_title
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        query,
        total_count,
        top_users,
        trends,
        samples
      })
    };
  } catch (error) {
    console.error("Search API Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
