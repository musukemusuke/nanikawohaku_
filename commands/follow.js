const { SlashCommandBuilder } = require('discord.js');
const { saveUserToDB, searchUsersByUsername } = require('../utils/userUtils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('follow')
        .setDescription('指定したユーザーをフォローします（他サーバーのユーザーもユーザー名でフォロー可能）')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('フォローするユーザーのユーザー名')
                .setRequired(true)),
    async execute(interaction) {
        const searchUsername = interaction.options.getString('username');
        const db = interaction.client.db;
        const client = interaction.client;
        const followerId = interaction.user.id;

        // 自分自身をDBに保存
        await saveUserToDB(db, interaction.user);

        // ユーザー名で検索
        const users = await searchUsersByUsername(db, client, searchUsername);
        if (users.length === 0) {
            return interaction.reply({ content: `「${searchUsername}」に一致するユーザーが見つかりませんでした。`, flags: 64 });
        }

        // 完全一致するユーザーを優先的に選択
        const exactMatch = users.find(u => u.username.toLowerCase() === searchUsername.toLowerCase());
        const targetUserDB = exactMatch || users[0];
        const followedId = targetUserDB.id;

        // 自分自身をフォローできないようにする
        if (followerId === followedId) {
            return interaction.reply({ content: '自分自身をフォローすることはできません！', flags: 64 });
        }

        // 対象ユーザーをクライアントから取得
        let targetUser;
        try {
            targetUser = await client.users.fetch(followedId);
            // 取得したユーザーをDBに保存
            await saveUserToDB(db, targetUser);
        } catch (err) {
            return interaction.reply({ content: '指定されたユーザーが存在しません。', flags: 64 });
        }

        // 既にフォローしているか確認
        const isFollowing = await new Promise((resolve) => {
            db.get(`SELECT 1 FROM user_follows WHERE follower_id = ? AND followed_id = ?`, [followerId, followedId], (err, row) => {
                resolve(!!row);
            });
        });

        if (isFollowing) {
            // 既にフォローしている場合はフォロー解除
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM user_follows WHERE follower_id = ? AND followed_id = ?`, [followerId, followedId], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
            await interaction.reply({ content: `${targetUser.username}さんのフォローを解除しました！`, flags: 64 });
        } else {
            // フォローを追加
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO user_follows (follower_id, followed_id) VALUES (?, ?)`, [followerId, followedId], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
            await interaction.reply({ content: `${targetUser.username}さんをフォローしました！（他サーバーのユーザーでもフォロー可能です）`, flags: 64 });
        }
    }
};