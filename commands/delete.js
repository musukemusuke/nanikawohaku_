const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

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
            .setLabel('取り消したいいいねの投稿ID(不要なら空欄で)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

        // リプライ削除用の入力欄
        const replyIdInput = new TextInputBuilder()
            .setCustomId('replyId')
            .setLabel('削除したいリプライのID(不要なら空欄で)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

        // 投稿削除用の入力欄
        const postIdInput = new TextInputBuilder()
            .setCustomId('postId')
            .setLabel('削除したい投稿のID(不要なら空欄で)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

        // リポスト解除用の入力欄
        const repostIdInput = new TextInputBuilder()
             .setCustomId('repostId')
             .setLabel('取り消したいリポストのID(不要なら空欄で)')
             .setStyle(TextInputStyle.Short)
             .setRequired(false)
             .setMaxLength(20);
        
        // フォロー解除用の入力欄
        const followIdInput = new TextInputBuilder()
             .setCustomId('followId')
             .setLabel('解除したいフォローのユーザーID(不要なら空欄で)')
             .setStyle(TextInputStyle.Short)
             .setRequired(false)
             .setMaxLength(20);
 
         const firstRow = new ActionRowBuilder().addComponents(likeIdInput);
         const secondRow = new ActionRowBuilder().addComponents(replyIdInput);
         const thirdRow = new ActionRowBuilder().addComponents(postIdInput);
         const fourthRow = new ActionRowBuilder().addComponents(repostIdInput);
         const fifthRow = new ActionRowBuilder().addComponents(followIdInput);
 
         modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);
        await interaction.showModal(modal);
    },
    async handleModalSubmit(interaction) {
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const likeId = interaction.fields.getTextInputValue('likeId') || null;
        const replyId = interaction.fields.getTextInputValue('replyId') || null;
        const postId = interaction.fields.getTextInputValue('postId') || null;
        const repostId = interaction.fields.getTextInputValue('repostId') || null;
        const followId = interaction.fields.getTextInputValue('followId') || null;

        const results = [];
        let hasProcessed = false;
        let finalResultsProcessed = false; // 結果をまとめて返すフラグ

        // いいねの削除処理
        if (likeId) {
            hasProcessed = true;
            db.get(`SELECT * FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, likeId], (err, row) => {
                if (err) {
                    console.error('Error getting like:', err);
                    results.push('❌ いいねの取得でエラーが発生しました');
                    checkAndSendResults();
                    return;
                }
                if (!row) {
                    results.push(`⚠️ 指定されたID ${likeId} のいいねは存在しません。`);
                } else {
                    db.run(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, likeId], (err) => {
                        if (err) {
                            console.error('Error deleting like:', err);
                            results.push('❌ いいねの削除でエラーが発生しました');
                        } else {
                            db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [likeId], (err) => {
                                if (err) {
                                    console.error('Error updating post likes:', err);
                                    results.push('❌ 投稿のいいね数更新でエラーが発生しました');
                                } else {
                                    results.push(`ID:${likeId}のいいねを取り消しました。`);
                                }
                                checkAndSendResults();
                            });
                            return;
                        }
                        checkAndSendResults();
                    });
                    return;
                }
                checkAndSendResults();
            });
        }

        // リポストの削除処理（リポスト解除）
        if (repostId) {
            hasProcessed = true;
            db.get(`SELECT * FROM reposts WHERE id = ? AND user_id = ?`, [repostId, userId], (err, row) => {
                if (err) {
                    console.error('Error getting repost:', err);
                    results.push('❌ リポストの取得でエラーが発生しました');
                    checkAndSendResults();
                    return;
                }
                if (!row) {
                    results.push(`⚠️ 指定されたID ${repostId} のリポストは存在しません。`);
                } else {
                    // リポストを削除して、元の投稿のリポスト数を減らす
                    db.run(`DELETE FROM reposts WHERE id = ?`, [repostId], (err) => {
                        if (err) {
                            console.error('Error deleting repost:', err);
                            results.push('❌ リポストの削除でエラーが発生しました');
                        } else {
                            db.run(`UPDATE posts SET reposts = reposts - 1 WHERE id = ?`, [row.original_post_id], (err) => {
                                if (err) {
                                    console.error('Error updating post reposts:', err);
                                    results.push('❌ 元の投稿のリポスト数更新でエラーが発生しました');
                                } else {
                                    results.push(`ID:${repostId}のリポストを取り消しました。`);
                                }
                                checkAndSendResults();
                            });
                            return;
                        }
                        checkAndSendResults();
                    });
                    return;
                }
                checkAndSendResults();
            });
        }

        // リプライの削除処理
        if (replyId) {
            hasProcessed = true;
            db.get(`SELECT * FROM replies WHERE id = ?`, [replyId], (err, row) => {
                if (err) {
                    console.error('Error getting reply:', err);
                    results.push('❌ リプライの取得でエラーが発生しました');
                    checkAndSendResults();
                    return;
                }
                if (!row) {
                    results.push(`⚠️ 指定されたID ${replyId} のリプライは存在しません。`);
                } else if (row.author_id !== userId) {
                    results.push(`⚠️ 他人のリプライ(ID:${replyId})は削除できません。`);
                } else {
                    db.run(`DELETE FROM replies WHERE id = ?`, [replyId], (err) => {
                        if (err) {
                            console.error('Error deleting reply:', err);
                            results.push('❌ リプライの削除でエラーが発生しました');
                        } else {
                            results.push(`✅ ID:${replyId}のリプライを削除しました。`);
                        }
                        checkAndSendResults();
                    });
                    return;
                }
                checkAndSendResults();
            });
        }

        // フォロー解除の処理
        if (followId) {
            hasProcessed = true;
            db.get(`SELECT 1 FROM user_follows WHERE follower_id = ? AND followed_id = ?`, [userId, followId], (err, row) => {
                if (err) {
                    console.error('Error getting follow:', err);
                    results.push('❌ フォロー情報の取得でエラーが発生しました');
                    checkAndSendResults();
                    return;
                }
                if (!row) {
                    results.push(`⚠️ 指定されたユーザーID ${followId} はフォローしていません。`);
                    checkAndSendResults();
                } else {
                    // フォローを解除
                    db.run(`DELETE FROM user_follows WHERE follower_id = ? AND followed_id = ?`, [userId, followId], async (err) => {
                        if (err) {
                            console.error('Error deleting follow:', err);
                            results.push('❌ フォロー解除でエラーが発生しました');
                            checkAndSendResults();
                        } else {
                            // 対象ユーザーの名前を取得して表示
                            try {
                                const targetUser = await interaction.client.users.fetch(followId);
                                results.push(`✅ ${targetUser.username}さん(ID:${followId})のフォローを解除しました。`);
                            } catch (fetchErr) {
                                results.push(`✅ ID:${followId}のフォローを解除しました。`);
                            }
                            checkAndSendResults();
                        }
                    });
                }
            });
        }

        // 投稿の削除処理（トランザクション付き）
        if (postId) {
            hasProcessed = true;
            db.get(`SELECT * FROM posts WHERE id = ?`, [postId], (err, row) => {
                if (err) {
                    console.error('Error getting post:', err);
                    results.push('❌ 投稿の取得でエラーが発生しました');
                    checkAndSendResults();
                    return;
                }
                if (!row) {
                    results.push(`⚠️ 指定されたID ${postId} の投稿は存在しません。`);
                    checkAndSendResults();
                } else if (row.author_id !== userId) {
                    results.push(`⚠️ 他人の投稿(ID:${postId})は削除できません。`);
                    checkAndSendResults();
                } else {
                    // トランザクションを開始
                    db.run('BEGIN', (err) => {
                        if (err) {
                            console.error('Error starting transaction:', err);
                            results.push('❌ トランザクションの開始でエラーが発生しました');
                            checkAndSendResults();
                            return;
                        }
                        // リプライを削除
                        db.run(`DELETE FROM replies WHERE post_id = ?`, [postId], (err) => {
                            if (err) {
                                console.error('Error deleting replies:', err);
                                db.run('ROLLBACK', () => {
                                    results.push('❌ リプライの削除でエラーが発生しました');
                                    checkAndSendResults();
                                });
                                return;
                            }
                            // いいね情報を削除
                            db.run(`DELETE FROM user_likes WHERE post_id = ?`, [postId], (err) => {
                                if (err) {
                                    console.error('Error deleting likes:', err);
                                    db.run('ROLLBACK', () => {
                                        results.push('❌ いいね情報の削除でエラーが発生しました');
                                        checkAndSendResults();
                                    });
                                    return;
                                }
                                // 投稿自体を削除
                                db.run(`DELETE FROM posts WHERE id = ?`, [postId], (err) => {
                                    if (err) {
                                        console.error('Error deleting post:', err);
                                        db.run('ROLLBACK', () => {
                                            results.push('❌ 投稿の削除でエラーが発生しました');
                                            checkAndSendResults();
                                        });
                                        return;
                                    }
                                    // 全ての処理が成功したらコミット
                                    db.run('COMMIT', () => {
                                        results.push(`✅ ID:${postId}の投稿を削除しました。`);
                                        checkAndSendResults();
                                    });
                                });
                            });
                        });
                    });
                }
            });
        }

        // 全ての非同期処理が完了したか確認して結果を送信する関数
        function checkAndSendResults() {
            // どの処理も実行されていない場合
            if (!hasProcessed && !finalResultsProcessed) {
                results.push('⚠️ どのIDも入力されていないか、無効なIDです。');
                finalResultsProcessed = true;
                interaction.reply({ content: results.join('\n'), flags: 64 }); // ephemeral
            } else if (finalResultsProcessed) {
                // 既に結果を送信済み
                return;
            } else {
                // like, reply, postの処理が全て完了したか確認（簡易的なチェック）
                // 1秒待ってから結果をまとめて送信（非同期処理の完了を待つ）
                if (!finalResultsProcessed) {
                    finalResultsProcessed = true;
                    setTimeout(() => {
                        interaction.reply({ content: results.join('\n'), flags: 64 }); // ephemeral
                    }, 1000);
                }
            }
        }

        // 最初にチェックを実行
        if (!hasProcessed) {
            checkAndSendResults();
        }
    }
};