const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notifications')
        .setDescription('自分宛ての未読通知を確認します'),
    async execute(interaction) {
        const db = interaction.client.db;
        const userId = interaction.user.id;

        // 未読の通知を新しい順に取得
        const notifications = await new Promise((resolve, reject) => {
            db.all(`
                SELECT n.*, p.content as post_content, p.author_id as post_author_id
                FROM notifications n
                JOIN posts p ON n.post_id = p.id
                WHERE n.user_id = ? AND n.read = 0
                ORDER BY n.created_at DESC
                LIMIT 50
            `, [userId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        if (notifications.length === 0) {
            const noNotifsEmbed = new EmbedBuilder()
                .setColor(0x00FFFF)
                .setTitle('🔔 通知はありません')
                .setDescription('新しい通知はありません。')
                .setTimestamp();
            return interaction.reply({ embeds: [noNotifsEmbed], flags: 64 });
        }

        // 通知を表示用の形式に変換
        const displayItems = await Promise.all(notifications.map(async (notif) => {
            const fromUser = await interaction.client.users.fetch(notif.from_user_id).catch(() => null);
            const fromUsername = fromUser ? fromUser.username : '不明なユーザー';
            const typeText = notif.type === 'like' ? '❤️ いいね' : '💬 リプライ';
            
            return {
                id: notif.id,
                author_username: `${typeText} - ${fromUsername}`,
                content: `投稿ID: ${notif.post_id}\n\n投稿内容:\n${notif.post_content}`,
                created_at: notif.created_at,
                guild_name: '通知'
            };
        }));

        // 全ての通知を既読に更新
        await new Promise((resolve, reject) => {
            db.run(`UPDATE notifications SET read = 1 WHERE user_id = ?`, [userId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        // 共通のページネーションユーティリティを使用して表示
        await createPaginatedFeed(interaction, displayItems, '🔔 新着通知一覧');
    }
};