const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('like')
        .setDescription('投稿にいいねを追加/取り消しします')
        .addStringOption(option =>
            option.setName('postid')
                .setDescription('いいねする投稿のID')
                .setRequired(true)
        ),
    async execute(interaction) {
        const postId = interaction.options.getString('postid');
        const userId = interaction.user.id;
        const db = interaction.client.db;

        // 投稿が存在するか確認
        db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, post) => {
            if (err) {
                console.error(err);
                return interaction.reply({ content: '投稿の取得中にエラーが発生しました', flags: 64 });
            }
            if (!post) {
                return interaction.reply({ content: '指定されたIDの投稿が存在しません', flags: 64 });
            }

            // 既にいいねしているか確認
            db.get(`SELECT 1 FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], async (err, row) => {
                if (err) {
                    console.error(err);
                    return interaction.reply({ content: 'いいねの確認中にエラーが発生しました', flags: 64 });
                }

                if (row) {
                    // いいねを取り消す
                    db.run(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], (err) => {
                        if (err) {
                            console.error(err);
                            return interaction.reply({ content: 'いいねの取り消し中にエラーが発生しました', flags: 64 });
                        }
                        db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [postId], (err) => {
                            if (err) console.error(err);
                        });
                        interaction.reply({ content: 'いいねを取り消しました！', flags: 64 });
                    });
                } else {
                    // いいねを追加する
                    db.run(`INSERT INTO user_likes (user_id, post_id) VALUES (?, ?)`, [userId, postId], (err) => {
                        if (err) {
                            console.error(err);
                            return interaction.reply({ content: 'いいねの追加中にエラーが発生しました', flags: 64 });
                        }
                        db.run(`UPDATE posts SET likes = likes + 1 WHERE id = ?`, [postId], (err) => {
                            if (err) console.error(err);
                        });
                        interaction.reply({ content: 'いいねしました！❤️', flags: 64 });
                    });
                }
            });
        });
    }
};