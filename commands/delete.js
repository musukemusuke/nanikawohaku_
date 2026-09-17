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
            try {
                const row = db.prepare(`SELECT * FROM user_likes WHERE user_id = ? AND post_id = ?`).get(userId, likeId);
                if (!row) {
                    results.push(`⚠️ 指定されたID ${likeId} のいいねは存在しません。`);
                } else {
                    db.prepare(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`).run(userId, likeId);
                    db.prepare(`UPDATE posts SET likes = likes - 1 WHERE id = ?`).run(likeId);
                    results.push(`✅ ID:${likeId}のいいねを取り消しました。`);
                }
            } catch (err) {
                console.error('Error processing like delete:', err);
                results.push('❌ いいねの処理でエラーが発生しました');
            }
        }

        // リプライの削除処理
        if (replyId) {
            hasProcessed = true;
            try {
                const row = db.prepare(`SELECT * FROM replies WHERE id = ?`).get(replyId);
                if (!row) {
                    results.push(`⚠️ 指定されたID ${replyId} のリプライは存在しません。`);
                } else if (row.author_id !== userId) {
                    results.push(`⚠️ 他人のリプライ(ID:${replyId})は削除できません。`);
                } else {
                    db.prepare(`DELETE FROM replies WHERE id = ?`).run(replyId);
                    results.push(`✅ ID:${replyId}のリプライを削除しました。`);
                }
            } catch (err) {
                console.error('Error processing reply delete:', err);
                results.push('❌ リプライの処理でエラーが発生しました');
            }
        }

        // 投稿の削除処理（トランザクション付き）
        if (postId) {
            hasProcessed = true;
            try {
                const row = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId);
                if (!row) {
                    results.push(`⚠️ 指定されたID ${postId} の投稿は存在しません。`);
                } else if (row.author_id !== userId) {
                    results.push(`⚠️ 他人の投稿(ID:${postId})は削除できません。`);
                } else {
                    // better-sqlite3でトランザクションを実行
                    const transaction = db.transaction(() => {
                        // リプライを削除
                        db.prepare(`DELETE FROM replies WHERE post_id = ?`).run(postId);
                        // いいね情報を削除
                        db.prepare(`DELETE FROM user_likes WHERE post_id = ?`).run(postId);
                        // 投稿自体を削除
                        db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId);
                    });
                    transaction();
                    results.push(`✅ ID:${postId}の投稿を削除しました。`);
                }
            } catch (err) {
                console.error('Error processing post delete:', err);
                results.push('❌ 投稿の削除中にエラーが発生しました');
            }
        }

        // 処理が何もされていない場合
        if (!hasProcessed) {
            results.push('⚠️ どのIDも入力されていないか、無効なIDです。');
        }

        // 結果を返す
        await interaction.reply({ content: results.join('\n'), flags: 64 }); // ephemeral
    }
};