const { SlashCommandBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feed')
        .setDescription('投稿フィードを表示します。')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('表示する投稿の種類を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '🏠 フォロー中のユーザーの投稿（ホーム）', value: 'home' },
                    { name: '🌐 全サーバーの公開投稿（グローバル）', value: 'global' },
                    { name: '🖥️ 現在のサーバーの投稿', value: 'server' },
                    { name: '📝 自分の投稿', value: 'my_posts' },
                    { name: '💬 自分が投稿したリプライ', value: 'my_replies' },
                    { name: '❤️ 自分がいいねした投稿', value: 'my_likes' }
                )),
    async execute(interaction) {
        const type = interaction.options.getString('type');
        const db = interaction.client.db;
        const userId = interaction.user.id;

        let query = '';
        let params = [];
        let title = '';

        switch (type) {
            case 'home': // フォローしているユーザーの投稿（元home.jsの処理）
                // フォローしているユーザーのID一覧を取得
                const followedUsers = await new Promise((resolve, reject) => {
                    db.all(`SELECT followed_id FROM user_follows WHERE follower_id = ?`, [userId], (err, rows) => {
                        if (err) return reject(err);
                        resolve(rows.map(row => row.followed_id));
                    });
                });

                // フォローしているユーザーがいない場合
                if (followedUsers.length === 0) {
                    return interaction.reply({ content: 'まだ誰もフォローしていません！/follow コマンドでユーザーをフォローしましょう。', flags: 64 });
                }

                // フォローしているユーザーの投稿を新しい順に取得（最大50件）
                const placeholders = followedUsers.map(() => '?').join(',');
                query = `SELECT * FROM posts WHERE author_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 50`;
                params = followedUsers;
                title = '🏠 ホームタイムライン';
                break;
            case 'global': // 全サーバーの公開投稿 + 自分が閲覧許可された非公開投稿（元globalfeedの処理）
                query = `SELECT * FROM posts WHERE (is_private = 0 OR (is_private = 1 AND (allowed_users LIKE ? OR author_username = ?))) ORDER BY created_at DESC LIMIT 50`;
                params = [`%${interaction.user.username}%`, interaction.user.username];
                title = '🌐 全サーバーの公開・閲覧可能な投稿';
                break;
            case 'server': // 現在のサーバーの投稿のみ表示
                query = `SELECT * FROM posts WHERE guild_id = ? AND (is_private = 0 OR (is_private = 1 AND (allowed_users LIKE ? OR author_username = ?))) ORDER BY created_at DESC LIMIT 50`;
                params = [interaction.guild.id, `%${interaction.user.username}%`, interaction.user.username];
                title = '🏠 現在のサーバーの投稿';
                break;
            case 'my_posts': // 自分の投稿（全サーバーの自分の投稿）
                query = `SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 50`;
                params = [userId];
                title = 'あなたの投稿';
                break;
            case 'my_replies': // 自分が投稿したリプライ（全サーバーの自分のリプライ）
                query = `SELECT * FROM replies WHERE author_id = ? ORDER BY created_at DESC LIMIT 50`;
                params = [userId];
                title = 'あなたが投稿したリプライ';
                break;
            case 'my_likes': // 自分がいいねした投稿（全サーバーのいいねした投稿）
                query = `SELECT posts.* FROM posts JOIN user_likes ON posts.id = user_likes.post_id WHERE user_likes.user_id = ? ORDER BY posts.created_at DESC LIMIT 50`;
                params = [userId];
                title = 'あなたがいいねした投稿';
                break;
        }

        db.all(query, params, async (err, allPosts) => {
            if (err) {
                console.error('Error getting posts:', err);
                await interaction.reply({ content: '投稿の取得中にエラーが発生しました。', flags: 64 });
                return;
            }
            if (allPosts.length === 0) {
                await interaction.reply({ content: '該当する投稿がありませんでした。', flags: 64 });
                return;
            }
            await createPaginatedFeed(interaction, allPosts, title);
        });
    },
    async handlePageButton(interaction) {
        await interaction.deferUpdate();
        await handlePageInteraction(interaction);
    }
};