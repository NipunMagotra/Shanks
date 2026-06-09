import sqlite3
import json
import csv
import os
import re
from collections import Counter

# Stop words to filter out for word frequency rankings
STOP_WORDS = {
    'is', 'the', 'u', 'a', 'you', 'i', 'to', 'on', 'and', 'no', 'this', 'it',
    'ww', 'he', 'in', 'bro', 'that', 'are', 'of', 'for', 'ur', 'all', 'we',
    'lo', 'what', 'so', 'hah', 'me', 'not', 's', 'like', 'com', 'just',
    'can', 'they', 'go', 'your', 'my', 'why', 'do', 'with', 'its', 'yes',
    'w', 'im', 'good', 'day', 'get', 'have', 'win', 'was', 'https', 'www',
    'shanks', 'has', 'be', 'at', 'chat', 'up', 'discord', 'his', 'game',
    'rofl', 'him', 'bigphish'
}

def parse_duration_seconds(duration_str):
    if not duration_str or duration_str == 'N/A':
        return 3600 # default fallback 1 hour
    seconds = 0
    match = re.search(r'(\d+)h', duration_str)
    if match:
        seconds += int(match.group(1)) * 3600
    match = re.search(r'(\d+)m', duration_str)
    if match:
        seconds += int(match.group(1)) * 60
    match = re.search(r'(\d+)s', duration_str)
    if match:
        seconds += int(match.group(1))
    return max(seconds, 60)

def compute_all_stats():
    db_path = os.path.join('database', 'twitch_archive.db')
    out_path = os.path.join('reports', 'dashboard_stats.json')
    
    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Load VOD metadata
    vod_meta = {}
    vod_list_path = os.path.join('vods', 'all_vods_list.json')
    if os.path.exists(vod_list_path):
        with open(vod_list_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for item in data:
                vod_meta[item['id']] = {
                    "views": item.get('view_count', 0),
                    "duration": item.get('duration', 'N/A'),
                    "duration_seconds": parse_duration_seconds(item.get('duration', 'N/A')),
                    "url": item.get('url', f"https://www.twitch.tv/videos/{item['id']}")
                }

    print("Step 1: Calculating baseline KPI metrics...")
    cursor.execute("SELECT COUNT(*) FROM chat_messages;")
    total_messages = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT username) FROM chat_messages WHERE LOWER(username) NOT IN ('fossabot', 'streamelements');")
    total_chatters = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM processed_vods;")
    total_vods = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM chat_messages WHERE subscriber = 1 AND LOWER(username) NOT IN ('fossabot', 'streamelements');")
    sub_messages = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM chat_messages WHERE moderator = 1 AND LOWER(username) NOT IN ('fossabot', 'streamelements');")
    mod_messages = cursor.fetchone()[0]

    # Standard Leaderboards
    cursor.execute("SELECT username, COUNT(*) as cnt FROM chat_messages WHERE LOWER(username) NOT IN ('fossabot', 'streamelements') GROUP BY username ORDER BY cnt DESC LIMIT 10;")
    top_chatters = [{"username": r[0], "count": r[1]} for r in cursor.fetchall()]
    
    cursor.execute("SELECT username, COUNT(*) as cnt FROM chat_messages WHERE subscriber = 1 AND LOWER(username) NOT IN ('fossabot', 'streamelements') GROUP BY username ORDER BY cnt DESC LIMIT 10;")
    top_subs = [{"username": r[0], "count": r[1]} for r in cursor.fetchall()]
    
    cursor.execute("SELECT username, COUNT(*) as cnt FROM chat_messages WHERE moderator = 1 AND LOWER(username) NOT IN ('fossabot', 'streamelements') GROUP BY username ORDER BY cnt DESC LIMIT 10;")
    top_mods = [{"username": r[0], "count": r[1]} for r in cursor.fetchall()]

    print("Step 2: Commencing single-pass analytics loop...")
    vod_totals = Counter()
    vod_titles = {}
    vod_dates = {}
    word_counter = Counter()
    
    # Stream the data in chunks of 100,000 rows
    chunk_size = 100000
    offset = 0
    
    word_pattern = re.compile(r'\b[a-zA-Z]+\b')
    
    while True:
        cursor.execute("""
            SELECT message, stream_title, stream_date, vod_id 
            FROM chat_messages 
            LIMIT ? OFFSET ?;
        """, (chunk_size, offset))
        rows = cursor.fetchall()
        if not rows:
            break
            
        for message, stream_title, stream_date, vod_id in rows:
            if not message:
                continue
                
            message_lower = message.lower()
            msg_words = word_pattern.findall(message_lower)
            
            # Update overall counts
            vod_totals[vod_id] += 1
            vod_titles[vod_id] = stream_title
            vod_dates[vod_id] = stream_date
            
            # Words counter
            filtered_words = [w for w in msg_words if w not in STOP_WORDS]
            word_counter.update(filtered_words)
                
        offset += chunk_size
        print(f"  Aggregated {offset} messages...")
        if offset >= total_messages:
            break
            
    print("Step 3: Compiling analytical indices...")
    
    top_vods = []
    for vod_id, total in vod_totals.items():
        meta = vod_meta.get(vod_id, {"views": 0, "duration": "N/A", "url": f"https://www.twitch.tv/videos/{vod_id}"})
        top_vods.append({
            "vod_id": vod_id,
            "title": vod_titles.get(vod_id, "Unknown Stream"),
            "date": vod_dates.get(vod_id, "N/A")[:10],
            "total_messages": total,
            "count": total,
            "views": meta["views"],
            "duration": meta["duration"],
            "url": meta["url"]
        })
    top_vods = sorted(top_vods, key=lambda x: x['total_messages'], reverse=True)

    # Top Emotes
    top_emotes = []
    csv_path = os.path.join('reports', 'top_emotes.csv')
    if os.path.exists(csv_path):
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if i >= 10:
                    break
                top_emotes.append({
                    "name": row['emote_name'],
                    "id": row['emote_id'],
                    "count": int(row['usage_count'])
                })

    # Assemble complete dashboard stats
    top_words = [{"word": item[0], "count": item[1]} for item in word_counter.most_common(12)]
    
    print("Computing top days...")
    top_days = [{"date": r[0], "count": r[1]} for r in cursor.execute("SELECT SUBSTR(stream_date, 1, 10) as dt, COUNT(*) as cnt FROM chat_messages GROUP BY dt ORDER BY cnt DESC LIMIT 10;").fetchall() if r[0]]
    
    stats_data = {
        "kpis": {
            "total_messages": total_messages,
            "total_chatters": total_chatters,
            "total_vods": total_vods,
            "subscriber_messages": sub_messages,
            "moderator_messages": mod_messages
        },
        "top_chatters": top_chatters,
        "top_subs": top_subs,
        "top_mods": top_mods,
        "top_vods": top_vods,
        "top_emotes": top_emotes,
        "monthly_trend": [{"month": r[0], "count": r[1]} for r in cursor.execute("SELECT SUBSTR(stream_date, 1, 7) as ym, COUNT(*) FROM chat_messages GROUP BY ym ORDER BY ym ASC;").fetchall() if r[0]],
        "hourly_trend": [{"hour": r[0], "count": r[1]} for r in cursor.execute("SELECT SUBSTR(timestamp, 12, 2) as hr, COUNT(*) FROM chat_messages GROUP BY hr ORDER BY hr ASC;").fetchall() if r[0]],
        "top_days": top_days,
        "top_words": top_words
    }
    
    # Save as JSON with UTF-8
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(stats_data, f, ensure_ascii=False, indent=2)
        
    print(f"Stats cache successfully written to {out_path}")
    conn.close()

if __name__ == '__main__':
    compute_all_stats()
