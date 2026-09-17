const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('like')
        .setDescription('投稿にいいねをする')
        .addStringOption(option =>
            option.setName('postid')
                .setDescription('いいねする投稿のID')
                .setRequired(true)
        ),
    async execute(interaction) {
        const db = interaction.client.db;
        const postId = interaction.options.getString('postid');
        const userId = interaction.user.id;

        // 投稿が存在するか確認
        db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, post) => {
            if (err) {
                console.error('Error checking post:', err.message);
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ エラー')
                    .setDescription('投稿の確認中にエラーが発生しました。')
                    .setTimestamp();
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            if (!post) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor(0xff9900)
                    .setTitle('⚠️ 投稿が見つかりません')
                    .setDescription(`指定されたID「${postId}」の投稿が見つかりませんでした。`)
                    .setTimestamp();
                return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
            }

            // 既にいいねしているか確認
            db.get(`SELECT * FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], async (err, row) => {
                if (err) {
                    console.error('Error checking like status:', err.message);
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('❌ エラー')
                        .setDescription('いいね状態の確認中にエラーが発生しました。')
                        .setTimestamp();
                    return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }

                if (row) {
                    // いいねを取り消す
                    db.run(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], (err) => {
                        if (err) {
                            console.error('Error unliking post:', err.message);
                            const errorEmbed = new EmbedBuilder()
                                .setColor(0xff0000)
                                .setTitle('❌ エラー')
                                .setDescription('いいねの取り消し中にエラーが発生しました。')
                                .setTimestamp();
                            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                        }
                        db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [postId], async (err) => {
                            if (err) {
                                console.error('Error updating like count:', err.message);
                                const errorEmbed = new EmbedBuilder()
                                    .setColor(0xff0000)
                                    .setTitle('❌ エラー')
                                    .setDescription('いいね数の更新中にエラーが発生しました。')
                                    .setTimestamp();
                                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                            }
                            const unlikedEmbed = new EmbedBuilder()
                                .setColor(0x0099ff)
                                .setTitle('✅ いいねを取り消しました')
                                .setDescription(`ID「${postId}」の投稿のいいねを取り消しました。`)
                                .setTimestamp();
                            await interaction.reply({ embeds: [unlikedEmbed], ephemeral: true });
                        });
                    });
                } else {
                    // いいねを追加する
                    db.run(`INSERT INTO user_likes (user_id, post_id) VALUES (?, ?)`, [userId, postId], (err) => {
                        if (err) {
                            console.error('Error liking post:', err.message);
                            const errorEmbed = new EmbedBuilder()
                                .setColor(0xff0000)
                                .setTitle('❌ エラー')
                                .setDescription('いいねの処理中にエラーが発生しました。')
                                .setTimestamp();
                            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                        }
                        db.run(`UPDATE posts SET likes = likes + 1 WHERE id = ?`, [postId], async (err) => {
                            if (err) {
                                console.error('Error updating like count:', err.message);
                                const errorEmbed = new EmbedBuilder()
                                    .setColor(0xff0000)
                                    .setTitle('❌ エラー')
                                    .setDescription('いいね数の更新中にエラーが発生しました。')
                                    .setTimestamp();
                                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                            }
                            const likedEmbed = new EmbedBuilder()
                                .setColor(0x00ff99)
                                .setTitle('❤️ いいねしました！')
                                .setDescription(`ID「${postId}」の投稿にいいねしました。`)
                                .setTimestamp();
                            await interaction.reply({ embeds: [likedEmbed], ephemeral: true });
                        });
                    });
                }
            });
        });
    }
};