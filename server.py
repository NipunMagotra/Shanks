import sqlite3
import json
import os
from collections import Counter
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

app = Flask(__name__, 
            template_folder='.',
            static_folder='static')
CORS(app) # Enable CORS for all routes (important for static hosting on Netlify)

DB_PATH = os.path.join('database', 'twitch_archive.db')
STATS_PATH = os.path.join('reports', 'dashboard_stats.json')

# Cache the stats in memory on server load
STATS_CACHE = None
if os.path.exists(STATS_PATH):
    try:
        with open(STATS_PATH, 'r', encoding='utf-8') as f:
            STATS_CACHE = json.load(f)
        print("Precalculated stats loaded into memory.")
    except Exception as e:
        print(f"Error loading stats cache: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stats')
def get_stats():
    global STATS_CACHE
    if STATS_CACHE is None:
        if os.path.exists(STATS_PATH):
            with open(STATS_PATH, 'r', encoding='utf-8') as f:
                STATS_CACHE = json.load(f)
        else:
            return jsonify({"error": "Precalculated stats not found. Please run compute_stats.py."}), 404
    return jsonify(STATS_CACHE)

@app.route('/api/search')
def search():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({
            "query": "",
            "total_count": 0,
            "top_users": [],
            "trends": [],
            "samples": []
        })

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Query matching rows for user & date counts using the FTS5 virtual table
        cursor.execute("""
            SELECT username, stream_date 
            FROM chat_messages_fts 
            WHERE message MATCH ? AND LOWER(username) NOT IN ('fossabot', 'streamelements');
        """, (query,))
        rows = cursor.fetchall()
        
        total_count = len(rows)
        
        # Python-side aggregation (extremely fast)
        user_counts = Counter(r[0] for r in rows).most_common(10)
        top_users = [{"username": username, "count": count} for username, count in user_counts]
        
        # Date trends (messages per stream date)
        # Date is stored as ISO format (e.g. YYYY-MM-DDTHH:MM:SSZ) or short date, we take first 10 chars
        date_counts = Counter(r[1][:10] for r in rows if r[1])
        trends = [{"date": dt, "count": count} for dt, count in sorted(date_counts.items())]
        
        # Fetch sample messages using FTS5 (instant because MATCH filters using full-text index)
        cursor.execute("""
            SELECT username, message, timestamp, stream_title 
            FROM chat_messages_fts 
            WHERE message MATCH ? AND LOWER(username) NOT IN ('fossabot', 'streamelements')
            ORDER BY timestamp DESC 
            LIMIT 20;
        """, (query,))
        samples = []
        for r in cursor.fetchall():
            samples.append({
                "username": r[0],
                "message": r[1],
                "timestamp": r[2],
                "stream_title": r[3]
            })
            
        conn.close()
        
        return jsonify({
            "query": query,
            "total_count": total_count,
            "top_users": top_users,
            "trends": trends,
            "samples": samples
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Retrieve port from environment variables (default to 5000)
    port = int(os.environ.get("PORT", 5000))
    # Never run debug=True in production unless explicitly configured
    debug_mode = os.environ.get("FLASK_DEBUG", "False").lower() in ("true", "1")
    
    print(f"Starting Shanks_TTV Chat Archive Server on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=debug_mode)

