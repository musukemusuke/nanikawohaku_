const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('follow')
        .setDescription('指定したユーザーをフォローします')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('フォローするユーザー')
                .setRequired(true)),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const db = interaction.client.db;
        const followerId = interaction.user.id;
        const followedId = targetUser.id;

        // 自分自身をフォローできないようにする
        if (followerId === followedId) {
            return interaction.reply({ content: '自分自身をフォローすることはできません！', flags: 64 });
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
            await interaction.reply({ content: `${targetUser.username}さんをフォローしました！`, flags: 64 });
        }
    }
};