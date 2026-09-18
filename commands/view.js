const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view')
        .setDescription('各種コンテンツを閲覧するコマンドです')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('閲覧したいコンテンツの種類')
                .setRequired(true)
                .addChoices(
                    { name: 'リプライ一覧', value: 'replies' },
                    { name: 'いいねしたユーザー', value: 'likes' },
                    { name: 'リポストしたユーザー', value: 'reposts' }
                ))
        .addStringOption(option =>
            option.setName('id')
                .setDescription('対象の投稿ID')
                .setRequired(true)),
    async execute(interaction) {
        const type = interaction.options.getString('type');
        const targetId = interaction.options.getString('id');
        const db = interaction.client.db;

        if (type === 'replies') {
            // リプライ一覧表示処理
            const postId = targetId;
            db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, post) => {
                if (err) {
                    console.error('Error fetching post:', err.message);
                    await interaction.reply({ content: '投稿の取得中にエラーが発生しました。', flags: 64 });
                    return;
                }

                if (!post) {
                    await interaction.reply({ content: '指定されたIDの投稿が存在しません。', flags: 64 });
                    return;
                }

                db.all(`SELECT * FROM replies WHERE post_id = ? ORDER BY created_at DESC LIMIT 50`, [postId], async (err, replies) => {
                    if (err) {
                        console.error('Error fetching replies:', err.message);
                        await interaction.reply({ content: 'リプライの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (replies.length === 0) {
                        await interaction.reply({ content: 'この投稿にはまだリプライがありません。', flags: 64 });
                        return;
                    }

                    const allItems = [post, ...replies];
                    await createPaginatedFeed(interaction, allItems, `投稿「${post.id}」のリプライ一覧`, false);
                });
            });
        } else if (type === 'likes') {
            // いいねしたユーザー一覧表示処理
            const postId = targetId;
            db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, post) => {
                if (err) {
                    console.error('Error fetching post:', err.message);
                    await interaction.reply({ content: '投稿の取得中にエラーが発生しました。', flags: 64 });
                    return;
                }

                if (!post) {
                    await interaction.reply({ content: '指定されたIDの投稿が存在しません。', flags: 64 });
                    return;
                }

                db.all(`SELECT u.* FROM user_likes l JOIN users u ON l.user_id = u.id WHERE l.post_id = ? ORDER BY l.created_at DESC LIMIT 50`, [postId], async (err, likes) => {
                    if (err) {
                        console.error('Error fetching likes:', err.message);
                        await interaction.reply({ content: 'いいねユーザーの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (likes.length === 0) {
                        await interaction.reply({ content: 'この投稿にはまだいいねがありません。', flags: 64 });
                        return;
                    }

                    // ユーザー一覧をEmbedで表示
                    const likeList = likes.map((user, i) => `${i+1}. <@${user.id}> (${user.username})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setColor(0x1DA1F2)
                        .setTitle(`❤️ 投稿「${post.id}」のいいね一覧`)
                        .setDescription(likeList)
                        .setFooter({ text: `全${likes.length}件` });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                });
            });
        } else if (type === 'reposts') {
            // リポストしたユーザー一覧表示処理
            const postId = targetId;
            db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, post) => {
                if (err) {
                    console.error('Error fetching post:', err.message);
                    await interaction.reply({ content: '投稿の取得中にエラーが発生しました。', flags: 64 });
                    return;
                }

                if (!post) {
                    await interaction.reply({ content: '指定されたIDの投稿が存在しません。', flags: 64 });
                    return;
                }

                db.all(`SELECT u.* FROM reposts r JOIN users u ON r.user_id = u.id WHERE r.original_post_id = ? ORDER BY r.created_at DESC LIMIT 50`, [postId], async (err, reposts) => {
                    if (err) {
                        console.error('Error fetching reposts:', err.message);
                        await interaction.reply({ content: 'リポストユーザーの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (reposts.length === 0) {
                        await interaction.reply({ content: 'この投稿にはまだリポストがありません。', flags: 64 });
                        return;
                    }

                    // ユーザー一覧をEmbedで表示
                    const repostList = reposts.map((user, i) => `${i+1}. <@${user.id}> (${user.username})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setColor(0x1DA1F2)
                        .setTitle(`🔄 投稿「${post.id}」のリポスト一覧`)
                        .setDescription(repostList)
                        .setFooter({ text: `全${reposts.length}件` });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                });
            });
        }
    }
};