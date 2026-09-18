const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewreplies')
        .setDescription('指定した投稿の全てのリプライを表示します。')
        .addStringOption(option =>
            option.setName('postid')
                .setDescription('リプライを表示したい投稿のID')
                .setRequired(true)),
    async execute(interaction) {
        const postId = interaction.options.getString('postid');
        const db = interaction.client.db;

        // まず元の投稿が存在するか確認
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

            // 次にその投稿についた全てのリプライを取得
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

                // 元の投稿を最初に配列に追加して、共通ユーティリティで処理
                const allItems = [post, ...replies];
                await createPaginatedFeed(interaction, allItems, `投稿「${post.id}」のリプライ一覧`, false);
            });
        });
    },
    async handlePageButton(interaction) {
        await interaction.deferUpdate();
        await handlePageInteraction(interaction);
    }
};