const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('投稿またはユーザーを検索します')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('検索の種類を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '#️⃣ ハッシュタグで投稿を検索', value: 'hashtag' },
                    { name: '👤 ユーザー名でユーザーを検索', value: 'user' }
                ))
        .addStringOption(option =>
            option.setName('keyword')
                .setDescription('検索キーワード（ハッシュタグは#不要）')
                .setRequired(true)),
    async execute(interaction) {
        const db = interaction.client.db;
        const type = interaction.options.getString('type');
        const keyword = interaction.options.getString('keyword').toLowerCase();

        if (type === 'hashtag') {
            // ハッシュタグ検索（元search.jsの処理）
            const posts = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT p.* FROM posts p
                    JOIN post_hashtags ph ON p.id = ph.post_id
                    WHERE ph.hashtag = ?
                    AND p.is_private = 0 -- 公開投稿のみ検索
                    ORDER BY p.created_at DESC
                    LIMIT 50
                `, [keyword], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            });

            if (posts.length === 0) {
                const noPostsEmbed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('🔍 投稿が見つかりませんでした')
                    .setDescription(`#${keyword} が付いた公開投稿は存在しません。`)
                    .setTimestamp();
                return interaction.reply({ embeds: [noPostsEmbed], flags: 64 });
            }

            // 共通のページネーションユーティリティを使用して表示
            await createPaginatedFeed(interaction, posts, `🔍 検索結果: #${keyword} (${posts.length}件)`);
        } else if (type === 'user') {
            // ユーザー検索（元usersearch.jsの処理）
            const authors = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT DISTINCT author_id, author_username 
                    FROM posts 
                    WHERE LOWER(author_username) LIKE ?
                    LIMIT 10
                `, [`%${keyword}%`], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            });

            if (authors.length === 0) {
                const noUsersEmbed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('🔍 ユーザーが見つかりませんでした')
                    .setDescription(`"${keyword}" に一致するユーザーは存在しません。`)
                    .setTimestamp();
                return interaction.reply({ embeds: [noUsersEmbed], flags: 64 });
            }

            // 検索結果をEmbedに整形
            const searchEmbed = new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setTitle(`🔍 ユーザー検索結果: "${keyword}"`)
                .setTimestamp();

            let description = '';
            for (let i = 0; i < authors.length; i++) {
                const author = authors[i];
                // フォロワー数を取得
                const followers = await new Promise((resolve) => {
                    db.get(`SELECT COUNT(*) as count FROM user_follows WHERE followed_id = ?`, [author.author_id], (err, row) => {
                        resolve(row ? row.count : 0);
                    });
                });
                description += `${i + 1}. **${author.author_username}**\n   フォロワー: ${followers}人\n   /profile ${author.author_username} でプロフィールを表示\n\n`;
            }
            searchEmbed.setDescription(description);

            await interaction.reply({ embeds: [searchEmbed], flags: 64 });
        }
    }
};