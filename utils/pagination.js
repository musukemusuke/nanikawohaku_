const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ユーザーのいいね状態を確認するヘルパー関数
async function getUserLikeStatus(db, userId, postId) {
    return new Promise((resolve) => {
        db.get(`SELECT 1 FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], (err, row) => {
            resolve(!!row); // trueなら既にいいね済み
        });
    });
}

async function createPaginatedFeed(interaction, posts, title, isPostList = true, additionalEmbed = null) {
    const limit = 5;
    let currentPage = 0;
    const totalPages = Math.ceil(posts.length / limit);
    const db = interaction.client.db;
    const userId = interaction.user.id;

    // リプライ数を事前に全投稿分取得 + いいねステータスも取得
    const replyCounts = await Promise.all(posts.map(post => {
        return new Promise((resolve) => {
            db.get(`SELECT COUNT(*) as count FROM replies WHERE post_id = ?`, [post.id], (err, row) => {
                resolve(row?.count || 0);
            });
        });
    }));
    const likeStatuses = await Promise.all(posts.map(post => getUserLikeStatus(db, userId, post.id)));

    const displayPage = async (page) => {
        const start = page * limit;
        const end = start + limit;
        const pageItems = posts.slice(start, end);

        const embeds = [];
        // 追加のEmbed（プロフィール情報など）があれば最初に追加
        if (additionalEmbed && page === 0) {
            embeds.push(additionalEmbed);
        }
        
        const allComponents = [];
        const pageMessageId = interaction.id;

        // Twitter風の投稿Embedを作成
        for (let i = 0; i < pageItems.length; i++) {
            const item = pageItems[i];
            const replyCount = isPostList ? replyCounts[start + i] : null;
            const isLiked = isPostList ? likeStatuses[start + i] : null;
            
            const postEmbed = new EmbedBuilder()
                .setAuthor({ 
                    name: item.author_username, 
                    iconURL: interaction.client.users.cache.get(item.author_id)?.displayAvatarURL() || interaction.user.displayAvatarURL() 
                })
                .setDescription(item.content)
                .setColor(0x1DA1F2) // Twitterの青色
                .setTimestamp(new Date(item.created_at))
                .setFooter({ text: `ID: ${item.id}` });

            if (isPostList) {
                postEmbed.addFields(
                    { name: '💬 リプライ', value: String(replyCount), inline: true },
                    { name: '❤️ いいね', value: String(item.likes), inline: true },
                    { name: '🌐 サーバー', value: item.guild_name || '不明', inline: true }
                );
                if (item.image_url) postEmbed.setImage(item.image_url);

                // 投稿ごとにいいね/リプライボタンを追加（投稿一覧の場合のみ）
                const likeButton = new ButtonBuilder()
                    .setCustomId(`like_post_${item.id}`)
                    .setLabel(isLiked ? 'いいね取消' : 'いいね')
                    .setStyle(isLiked ? ButtonStyle.Danger : ButtonStyle.Primary)
                    .setEmoji(isLiked ? '💔' : '❤️');

                const replyButton = new ButtonBuilder()
                    .setCustomId(`reply_post_${item.id}`)
                    .setLabel('リプライ')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💬');

                const actionRow = new ActionRowBuilder().addComponents(likeButton, replyButton);
                allComponents.push(actionRow);
            } else {
                // リプライ専用のEmbed
                postEmbed.setTitle(`💬 リプライ by ${item.author_username}`);
            }

            embeds.push(postEmbed);
        }

        // ページングボタンを最後に追加
        if (totalPages > 1) {
            const prevButton = new ButtonBuilder()
                .setCustomId(`prev_page_${pageMessageId}`)
                .setLabel('前へ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
                .setDisabled(page === 0);

            const nextButton = new ButtonBuilder()
                .setCustomId(`next_page_${pageMessageId}`)
                .setLabel('次へ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('➡️')
                .setDisabled(page >= totalPages - 1);

            const pageRow = new ActionRowBuilder().addComponents(prevButton, nextButton);
            allComponents.push(pageRow);

            // ページング用データを保存
            interaction.client.pageInteractions.set(pageMessageId, {
                originalInteraction: interaction,
                allRows: posts,
                currentPage: page,
                totalPages: totalPages,
                userId: userId,
                title: title,
                messageId: pageMessageId,
                isPostList: isPostList
            });
        }

        // 既に返信済みかどうかでeditReplyかreplyを使い分ける
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
                content: `${title} - ${page + 1}/${totalPages}ページ（全${posts.length}件）`,
                embeds: embeds,
                components: allComponents
            });
        } else {
            await interaction.reply({
                content: `${title} - ${page + 1}/${totalPages}ページ（全${posts.length}件）`,
                embeds: embeds,
                components: allComponents,
                flags: 64
            });
        }
    };

    // 最初のページを表示
    await displayPage(currentPage);
}

// いいねボタンの処理
async function handleLikeButton(interaction) {
    const [_, __, postId] = interaction.customId.split('_');
    const db = interaction.client.db;
    const userId = interaction.user.id;

    // 既にいいねしているか確認
    const isLiked = await getUserLikeStatus(db, userId, postId);

    if (isLiked) {
        // いいねを取り消す
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], (err) => {
                if (err) return reject(err);
                db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [postId], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
        await interaction.reply({ content: 'いいねを取り消しました！', flags: 64 });
    } else {
        // いいねを追加
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO user_likes (user_id, post_id) VALUES (?, ?)`, [userId, postId], (err) => {
                if (err) return reject(err);
                db.run(`UPDATE posts SET likes = likes + 1 WHERE id = ?`, [postId], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
        await interaction.reply({ content: 'いいねしました！❤️', flags: 64 });
    }

    // フィードを再読み込みして状態を更新
    setTimeout(async () => {
        await interaction.deleteReply();
    }, 1500);
}

// リプライボタンの処理
async function handleReplyButton(interaction) {
    const [_, __, postId] = interaction.customId.split('_');
    await interaction.reply({ 
        content: `この投稿にリプライするには /reply postid:${postId} content:<リプライ内容> を実行してください`,
        flags: 64 
    });
}

async function handlePageInteraction(interaction) {
    const [action, _, pageMessageId] = interaction.customId.split('_');
    const pageData = interaction.client.pageInteractions.get(pageMessageId);
    
    if (!pageData || interaction.user.id !== pageData.userId) {
        await interaction.reply({ content: 'この操作はできません。', flags: 64 });
        return;
    }

    const allItems = pageData.allRows;
    let currentPage = pageData.currentPage;
    const totalPages = pageData.totalPages;
    const title = pageData.title;
    const limit = 5;
    const db = interaction.client.db;
    const userId = interaction.user.id;

    if (action === 'next' && currentPage < totalPages - 1) {
        currentPage++;
    } else if (action === 'prev' && currentPage > 0) {
        currentPage--;
    } else {
        await interaction.reply({ content: 'これ以上ページを移動できません。', flags: 64 });
        return;
    }

    const start = currentPage * limit;
    const end = start + limit;
    const pageItems = allItems.slice(start, end);
    const pageMessageId_val = pageMessageId;

    // 投稿一覧の場合、最新のいいね状態を再取得
    const allPostData = pageData.isPostList ? await Promise.all(pageItems.map(async (post) => {
        const replyCount = await new Promise((resolve) => {
            db.get(`SELECT COUNT(*) as count FROM replies WHERE post_id = ?`, [post.id], (err, row) => {
                resolve(row?.count || 0);
            });
        });
        const isLiked = await getUserLikeStatus(db, userId, post.id);
        return { ...post, replyCount, isLiked };
    })) : pageItems;

    const embeds = [];
    const allComponents = [];

    for (let i = 0; i < pageItems.length; i++) {
        const item = pageData.isPostList ? allPostData[i] : pageItems[i];
        const postEmbed = new EmbedBuilder()
            .setAuthor({ 
                name: item.author_username, 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setDescription(item.content)
            .setColor(0x1DA1F2)
            .setTimestamp(new Date(item.created_at))
            .setFooter({ text: `ID: ${item.id}` });

        if (pageData.isPostList) {
            postEmbed.addFields(
                { name: '💬 リプライ', value: String(item.replyCount), inline: true },
                { name: '❤️ いいね', value: String(item.likes), inline: true },
                { name: '🌐 サーバー', value: item.guild_name || '不明', inline: true }
            );
            if (item.image_url) postEmbed.setImage(item.image_url);

            // 最新のいいね状態でボタンを再作成
            const replyButton = new ButtonBuilder()
                .setCustomId(`reply_post_${item.id}`)
                .setLabel('リプライ')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💬');
                
            const likeButton = new ButtonBuilder()
                .setCustomId(`like_post_${item.id}`)
                .setLabel(item.isLiked ? 'いいね取消' : 'いいね')
                .setStyle(item.isLiked ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji('❤️');

            const postRow = new ActionRowBuilder().addComponents(replyButton, likeButton);
            allComponents.push(postRow);
        } else {
            postEmbed.setTitle(`💬 リプライ by ${item.author_username}`);
        }

        embeds.push(postEmbed);
    }

    // ページングボタンを更新
    const prevButton = new ButtonBuilder()
        .setCustomId(`prev_page_${pageMessageId_val}`)
        .setLabel('前へ')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
        .setDisabled(currentPage === 0);

    const nextButton = new ButtonBuilder()
        .setCustomId(`next_page_${pageMessageId_val}`)
        .setLabel('次へ')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➡️')
        .setDisabled(currentPage >= totalPages - 1);

    const pageRow = new ActionRowBuilder().addComponents(prevButton, nextButton);
    allComponents.push(pageRow);

    // ページデータを更新
    pageData.currentPage = currentPage;
    interaction.client.pageInteractions.set(pageMessageId, pageData);

    await interaction.update({
        content: `${title} - ${currentPage + 1}/${totalPages}ページ（全${allItems.length}件）`,
        embeds: embeds,
        components: allComponents
    });
}

// UUIDを生成するヘルパー関数
function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// 通知を送信する共通関数
async function sendNotification(db, userId, fromUserId, postId, type) {
    // 自分自身のアクションなら通知しない
    if (userId === fromUserId) return;
    
    const notificationId = generateId();
    await new Promise((resolve, reject) => {
        db.run(`INSERT INTO notifications (id, user_id, type, from_user_id, post_id) VALUES (?, ?, ?, ?, ?)`, 
            [notificationId, userId, type, fromUserId, postId], (err) => {
                if (err) return reject(err);
                resolve();
            });
    });
}

module.exports = {
    createPaginatedFeed,
    handlePageInteraction,
    handleLikeButton,
    handleReplyButton,
    getUserLikeStatus,
    generateId,
    sendNotification // 通知送信関数も公開
};

// いいねボタンの処理
async function handleLikeButton(interaction) {
    const [_, __, postId] = interaction.customId.split('_');
    const db = interaction.client.db;
    const userId = interaction.user.id;

    // 既にいいねしているか確認
    const isLiked = await getUserLikeStatus(db, userId, postId);

    if (isLiked) {
        // いいねを取り消す
        await new Promise((resolve, reject) => {
            db.run(`DELETE FROM user_likes WHERE user_id = ? AND post_id = ?`, [userId, postId], (err) => {
                if (err) return reject(err);
                db.run(`UPDATE posts SET likes = likes - 1 WHERE id = ?`, [postId], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
        await interaction.reply({ content: 'いいねを取り消しました！', flags: 64 });
    } else {
        // いいねを追加する
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO user_likes (user_id, post_id) VALUES (?, ?)`, [userId, postId], (err) => {
                if (err) return reject(err);
                db.run(`UPDATE posts SET likes = likes + 1 WHERE id = ?`, [postId], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
        await interaction.reply({ content: 'いいねしました！❤️', flags: 64 });

        // 投稿の作者にいいね通知を送信
        const post = await new Promise((resolve) => {
            db.get(`SELECT author_id FROM posts WHERE id = ?`, [postId], (err, row) => {
                resolve(row);
            });
        });
        if (post) {
            await sendNotification(db, post.author_id, userId, postId, 'like');
        }
    }

    // 1.5秒後に返信を削除
    setTimeout(async () => {
        await interaction.deleteReply().catch(() => {});
    }, 1500);
}

// リプライボタンの処理
async function handleReplyButton(interaction) {
    const [_, __, postId] = interaction.customId.split('_');
    await interaction.reply({ 
        content: `この投稿にリプライするには \`/reply postid:${postId} content:<リプライ内容>\` を実行してください`,
        flags: 64 
    });
}

module.exports = { 
    createPaginatedFeed, 
    handlePageInteraction,
    handleLikeButton,
    handleReplyButton,
    getUserLikeStatus
};