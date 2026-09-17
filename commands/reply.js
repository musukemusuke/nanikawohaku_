const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { nanoid } = require('nanoid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reply')
        .setDescription('投稿にリプライを送信します')
        .addStringOption(option =>
            option.setName('postid')
                .setDescription('リプライする投稿のID')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('content')
                .setDescription('リプライの内容（最大280文字）')
                .setRequired(true)
                .setMaxLength(280)
        ),
    async execute(interaction) {
        const db = interaction.client.db;
        const postId = interaction.options.getString('postid');
        const replyContent = interaction.options.getString('content');
        const userId = interaction.user.id;
        const username = interaction.user.username;

        // 投稿が存在するか確認
        db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, post) => {
            if (err) {
                console.error('Error getting post:', err.message);
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ エラー')
                    .setDescription('投稿の検索中にエラーが発生しました。')
                    .setTimestamp();
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }

            if (!post) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor(0xff9900)
                    .setTitle('⚠️ 投稿が見つかりません')
                    .setDescription(`指定されたID「${postId}」の投稿が見つかりませんでした。`)
                    .setTimestamp();
                return interaction.reply({ embeds: [notFoundEmbed], flags: 64 });
            }

            const replyId = nanoid(10);
            const createdAt = new Date().toISOString();

            // リプライをデータベースに保存
            db.run(`INSERT INTO replies (id, post_id, author_id, author_username, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [replyId, postId, userId, username, replyContent, createdAt], async (err) => {
                if (err) {
                    console.error('Error inserting reply:', err.message);
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('❌ エラー')
                        .setDescription('リプライの保存中にエラーが発生しました。')
                        .setTimestamp();
                    return interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }

                const successEmbed = new EmbedBuilder()
                    .setColor(0x00ff99)
                    .setTitle('💬 リプライを送信しました！')
                    .setDescription(`ID「${postId}」の投稿にリプライを送信しました。\nリプライID: ${replyId}`)
                    .setTimestamp();
                await interaction.reply({ embeds: [successEmbed], flags: 64 });
            });
        });
    }
};