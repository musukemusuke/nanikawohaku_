const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('いいね・リプライ・投稿を削除する'),
    async execute(interaction) {
        // モーダルを作成
        const modal = new ModalBuilder()
            .setCustomId('delete_modal')
            .setTitle('削除する項目のIDを入力してください');

        // いいね取り消し用の入力欄
        const likeIdInput = new TextInputBuilder()
            .setCustomId('likeId')
            .setLabel('取り消したいいいねの投稿ID（不要なら空欄）')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

        // リプライ削除用の入力欄
        const replyIdInput = new TextInputBuilder()
            .setCustomId('replyId')
            .setLabel('削除したいリプライのID（不要なら空欄）')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

        // 投稿削除用の入力欄
        const postIdInput = new TextInputBuilder()
            .setCustomId('postId')
            .setLabel('削除したい投稿のID（不要なら空欄）')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

        const firstRow = new ActionRowBuilder().addComponents(likeIdInput);
        const secondRow = new ActionRowBuilder().addComponents(replyIdInput);
        const thirdRow = new ActionRowBuilder().addComponents(postIdInput);

        modal.addComponents(firstRow, secondRow, thirdRow);
        await interaction.showModal(modal);
    },
    async handleModalSubmit(interaction) {
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const likeId = interaction.fields.getTextInputValue('likeId') || null;
        const replyId = interaction.fields.getTextInputValue('replyId') || null;
        const postId = interaction.fields.getTextInputValue('postId') || null;

        const results = [];
        let hasProcessed = false;

        // いいねの削除処理
        if (likeId) {
            hasProcessed = true;
            db.get(`SELECT * FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, likeId], async (err, row) => {
                if (err) {
                    console.error('Error checking like:', err.message);
                    results.push('❌ いいねの確認中にエラーが発生しました。');
                } else if (!row) {
                    results.push(`⚠️ 指定されたID（${likeId}）のいいねは存在しません。`);
                } else {
                    db.run(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, likeId], (err) => {
                        if (err) {
                            console.error('Error deleting like:', err.message);
                            results.push(`❌ ID:${likeId}のいいねの取り消しに失敗しました。`);
                        } else {
                            db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [likeId], () => {});
                            results.push(`✅ ID:${likeId}のいいねを取り消しました。`);
                        }
                        interaction.reply({ content: results.join('\n'), ephemeral: true });
                    });
                }
            });
        }

        // リプライの削除処理
        if (replyId) {
            hasProcessed = true;
            db.get(`SELECT * FROM replies WHERE id = ?`, [replyId], async (err, row) => {
                if (err) {
                    console.error('Error checking reply:', err.message);
                    results.push('❌ リプライの確認中にエラーが発生しました。');
                } else if (!row) {
                    results.push(`⚠️ 指定されたID（${replyId}）のリプライは存在しません。`);
                } else if (row.author_id !== userId) {
                    results.push(`⚠️ 他人のリプライ（ID:${replyId}）は削除できません。`);
                } else {
                    db.run(`DELETE FROM replies WHERE id = ?`, [replyId], (err) => {
                        if (err) {
                            console.error('Error deleting reply:', err.message);
                            results.push(`❌ ID:${replyId}のリプライ削除に失敗しました。`);
                        } else {
                            results.push(`✅ ID:${replyId}のリプライを削除しました。`);
                        }
                        if (!likeId) {
                            interaction.reply({ content: results.join('\n'), ephemeral: true });
                        }
                    });
                }
            });
        }

        // 投稿の削除処理（トランザクション付き）
        if (postId) {
            hasProcessed = true;
            db.get(`SELECT * FROM posts WHERE id = ?`, [postId], async (err, row) => {
                if (err) {
                    console.error('Error checking post:', err.message);
                    results.push('❌ 投稿の確認中にエラーが発生しました。');
                } else if (!row) {
                    results.push(`⚠️ 指定されたID（${postId}）の投稿は存在しません。`);
                } else if (row.author_id !== userId) {
                    results.push(`⚠️ 他人の投稿（ID:${postId}）は削除できません。`);
                } else {
                    db.run('BEGIN TRANSACTION', (err) => {
                        if (err) {
                            console.error('Error starting transaction:', err.message);
                            results.push(`❌ ID:${postId}の投稿削除中にエラーが発生しました。`);
                            return interaction.reply({ content: results.join('\n'), ephemeral: true });
                        }
                        // リプライを削除
                        db.run(`DELETE FROM replies WHERE post_id = ?`, [postId], (err) => {
                            if (err) {
                                console.error('Error deleting replies:', err.message);
                                db.run('ROLLBACK', () => {
                                    results.push(`❌ ID:${postId}の投稿削除中にエラーが発生しました。`);
                                    interaction.reply({ content: results.join('\n'), ephemeral: true });
                                });
                                return;
                            }
                            // いいね情報を削除
                            db.run(`DELETE FROM user_likes WHERE post_id = ?`, [postId], (err) => {
                                if (err) {
                                    console.error('Error deleting likes:', err.message);
                                    db.run('ROLLBACK', () => {
                                        results.push(`❌ ID:${postId}の投稿削除中にエラーが発生しました。`);
                                        interaction.reply({ content: results.join('\n'), ephemeral: true });
                                    });
                                    return;
                                }
                                // 投稿自体を削除
                                db.run(`DELETE FROM posts WHERE id = ?`, [postId], (err) => {
                                    if (err) {
                                        console.error('Error deleting post:', err.message);
                                        db.run('ROLLBACK', () => {
                                            results.push(`❌ ID:${postId}の投稿削除中にエラーが発生しました。`);
                                            interaction.reply({ content: results.join('\n'), ephemeral: true });
                                        });
                                        return;
                                    }
                                    db.run('COMMIT', () => {
                                        results.push(`✅ ID:${postId}の投稿を削除しました。`);
                                        if (!likeId && !replyId) {
                                            interaction.reply({ content: results.join('\n'), ephemeral: true });
                                        }
                                    });
                                });
                            });
                        });
                    });
                }
            });
        }

        // どのIDも入力されていなかった場合
        if (!hasProcessed) {
                const warnEmbed = new EmbedBuilder()
                    .setColor(0xff9900)
                    .setTitle('⚠️ 入力エラー')
                    .setDescription('いずれかの項目にIDを入力してください。')
                    .setTimestamp();
                await interaction.reply({ embeds: [warnEmbed], ephemeral: true });
            }
    }
};