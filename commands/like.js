const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('like')
        .setDescription('投稿にいいねをします')
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

            // 既にいいねしているか確認
            db.get(`SELECT * FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], async (err, existingLike) => {
                if (err) {
                    console.error('Error checking existing like:', err.message);
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('❌ エラー')
                        .setDescription('いいねの確認中にエラーが発生しました。')
                        .setTimestamp();
                    return interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }

                if (existingLike) {
                    // いいねを取り消す
                    db.run(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], (err) => {
                        if (err) {
                            console.error('Error deleting like:', err.message);
                            const errorEmbed = new EmbedBuilder()
                                .setColor(0xff0000)
                                .setTitle('❌ エラー')
                                .setDescription('いいねの削除中にエラーが発生しました。')
                                .setTimestamp();
                            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
                        }

                        db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [postId], async (err) => {
                            if (err) {
                                console.error('Error updating likes:', err.message);
                                const errorEmbed = new EmbedBuilder()
                                    .setColor(0xff0000)
                                    .setTitle('❌ エラー')
                                    .setDescription('いいね数の更新中にエラーが発生しました。')
                                    .setTimestamp();
                                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
                            }

                            const unlikedEmbed = new EmbedBuilder()
                                .setColor(0x0099ff)
                                .setTitle('✓ いいねを取り消しました')
                                .setDescription(`ID「${postId}」の投稿のいいねを取り消しました。`)
                                .setTimestamp();
                            await interaction.reply({ embeds: [unlikedEmbed], flags: 64 });
                        });
                    });
                } else {
                    // いいねを追加する
                    db.run(`INSERT INTO user_likes (user_id, post_id) VALUES (?, ?)`, [userId, postId], (err) => {
                        if (err) {
                            console.error('Error inserting like:', err.message);
                            const errorEmbed = new EmbedBuilder()
                                .setColor(0xff0000)
                                .setTitle('❌ エラー')
                                .setDescription('いいねの追加中にエラーが発生しました。')
                                .setTimestamp();
                            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
                        }

                        db.run(`UPDATE posts SET likes = likes + 1 WHERE id = ?`, [postId], async (err) => {
                            if (err) {
                                console.error('Error updating likes:', err.message);
                                const errorEmbed = new EmbedBuilder()
                                    .setColor(0xff0000)
                                    .setTitle('❌ エラー')
                                    .setDescription('いいね数の更新中にエラーが発生しました。')
                                    .setTimestamp();
                                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
                            }

                            const likedEmbed = new EmbedBuilder()
                                .setColor(0x00ff99)
                                .setTitle('❤️ いいねしました！')
                                .setDescription(`ID「${postId}」の投稿にいいねしました。`)
                                .setTimestamp();
                            await interaction.reply({ embeds: [likedEmbed], flags: 64 });
                        });
                    });
                }
            });
        });
    }
};