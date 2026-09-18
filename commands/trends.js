const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trends')
        .setDescription('直近24時間の人気ハッシュタグトレンドを表示します'),
    async execute(interaction) {
        const db = interaction.client.db;

        // 24時間前の日時を計算
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 直近24時間で使用回数の多いハッシュタグを取得
        const trends = await new Promise((resolve, reject) => {
            db.all(`
                SELECT ph.hashtag, COUNT(*) as usage_count
                FROM post_hashtags ph
                JOIN posts p ON ph.post_id = p.id
                WHERE p.created_at >= ?
                AND p.is_private = 0
                GROUP BY ph.hashtag
                ORDER BY usage_count DESC
                LIMIT 10
            `, [twentyFourHoursAgo], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        if (trends.length === 0) {
            const noTrendsEmbed = new EmbedBuilder()
                .setColor(0x1DA1F2) // Twitterの青
                .setTitle('📊 現在のトレンド')
                .setDescription('直近24時間にハッシュタグが使用されていません。')
                .setTimestamp();
            return interaction.reply({ embeds: [noTrendsEmbed], flags: 64 });
        }

        // トレンドをEmbedに整形
        const trendsEmbed = new EmbedBuilder()
            .setColor(0x1DA1F2)
            .setTitle('📊 直近24時間のトレンド')
            .setTimestamp();

        // ランキング形式でフィールドを追加
        const medalEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        let description = '';
        trends.forEach((trend, index) => {
            description += `${medalEmojis[index]} #${trend.hashtag} - ${trend.usage_count}件\n`;
        });
        trendsEmbed.setDescription(description);

        await interaction.reply({ embeds: [trendsEmbed], flags: 64 });
    }
};