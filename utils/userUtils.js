// ユーザー情報をデータベースに保存する関数
async function saveUserToDB(db, user) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE id = ?`, [user.id], (err, row) => {
            if (err) return reject(err);
            const now = new Date().toISOString();
            if (row) {
                // 既に存在する場合は更新
                db.run(`UPDATE users SET username = ?, global_name = ?, avatar_url = ?, last_updated = ? WHERE id = ?`,
                    [user.username, user.globalName, user.avatarURL(), now, user.id], (updateErr) => {
                        if (updateErr) return reject(updateErr);
                        resolve();
                    });
            } else {
                // 新規作成
                db.run(`INSERT INTO users (id, username, discriminator, global_name, avatar_url, created_at, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [user.id, user.username, user.discriminator, user.globalName, user.avatarURL(), now, now], (insertErr) => {
                        if (insertErr) return reject(insertErr);
                        resolve();
                    });
            }
        });
    });
}

// ユーザー名でユーザーを検索する関数
async function searchUsersByUsername(db, client, searchQuery, limit = 10) {
    // まずデータベースから検索
    const dbUsers = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users WHERE username LIKE ? OR global_name LIKE ? LIMIT ?`,
            [`%${searchQuery}%`, `%${searchQuery}%`, limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
    });

    // データベースに結果があれば返す
    if (dbUsers.length > 0) {
        return dbUsers;
    }

    // クライアントのキャッシュからも検索して保存
    const cachedUsers = client.users.cache.filter(u =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.globalName && u.globalName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // キャッシュから見つかったユーザーをDBに保存
    for (const [, user] of cachedUsers) {
        await saveUserToDB(db, user);
    }

    // 再度DBから検索して返す
    const newDbUsers = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users WHERE username LIKE ? OR global_name LIKE ? LIMIT ?`,
            [`%${searchQuery}%`, `%${searchQuery}%`, limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
    });

    return newDbUsers;
}

module.exports = { saveUserToDB, searchUsersByUsername };