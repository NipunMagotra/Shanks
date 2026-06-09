import sqlite3
import os
import time

def main():
    db_path = os.path.join('database', 'twitch_archive.db')
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    print("Connecting to database...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Enable WAL mode for better concurrency and write speed
    print("Enabling WAL mode...")
    cursor.execute("PRAGMA journal_mode=WAL;")
    print(f"Journal mode is now: {cursor.fetchone()[0]}")

    # Step 1: Create FTS5 virtual table
    print("Creating FTS5 virtual table 'chat_messages_fts'...")
    cursor.execute("DROP TABLE IF EXISTS chat_messages_fts;")
    
    # We index message, username, stream_title for fast matching
    # UNINDEXED columns are metadata we want to retrieve without parsing or indexing them for text search
    cursor.execute("""
        CREATE VIRTUAL TABLE chat_messages_fts USING fts5(
            comment_id UNINDEXED,
            vod_id UNINDEXED,
            stream_title,
            stream_date UNINDEXED,
            timestamp UNINDEXED,
            username,
            user_id UNINDEXED,
            message,
            badges UNINDEXED,
            emotes UNINDEXED,
            subscriber UNINDEXED,
            moderator UNINDEXED,
            content='chat_messages',
            content_rowid='rowid'
        );
    """)

    # Step 2: Populate virtual table
    print("Populating FTS5 index (this might take a minute)...")
    t0 = time.time()
    
    # Insert from chat_messages table
    cursor.execute("""
        INSERT INTO chat_messages_fts(rowid, comment_id, vod_id, stream_title, stream_date, timestamp, username, user_id, message, badges, emotes, subscriber, moderator)
        SELECT rowid, comment_id, vod_id, stream_title, stream_date, timestamp, username, user_id, message, badges, emotes, subscriber, moderator FROM chat_messages;
    """)
    
    conn.commit()
    t1 = time.time()
    print(f"FTS5 index successfully built and populated in {t1 - t0:.2f} seconds.")

    # Verify search
    print("Verifying search performance...")
    t_start = time.time()
    cursor.execute("""
        SELECT username, stream_date 
        FROM chat_messages_fts 
        WHERE message MATCH 'washed' AND LOWER(username) NOT IN ('fossabot', 'streamelements');
    """)
    rows = cursor.fetchall()
    t_end = time.time()
    print(f"Found {len(rows)} matching rows in {t_end - t_start:.4f} seconds.")

    conn.close()
    print("Database optimization complete!")

if __name__ == '__main__':
    main()
