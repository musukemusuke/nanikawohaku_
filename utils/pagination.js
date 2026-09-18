const { EmbedBuilder } = require('discord.js');

async function createPaginatedFeed(interaction, posts, title, isPostList = true, additionalEmbed = null) {
    const db = interaction.client.db;

    // リプライ数を事前に全投稿分取得
    const replyCounts = await Promise.all(posts.map(post => {
        return new Promise((resolve) => {
            db.get(`SELECT COUNT(*) as count FROM replies WHERE post_id = ?`, [post.id], (err, row) => {
                resolve(row?.count || 0);
            });
        });
    }));

    const embeds = [];
    // 追加のEmbed（プロフィール情報など）があれば最初に追加
    if (additionalEmbed) {
        embeds.push(additionalEmbed);
    }

    // Twitter風の投稿Embedを作成（全投稿を一度に表示）
    for (let i = 0; i < posts.length; i++) {
        const item = posts[i];
        const replyCount = isPostList ? replyCounts[i] : null;
        
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
        } else {
            // リプライ専用のEmbed
            postEmbed.setTitle(`💬 リプライ by ${item.author_username}`);
        }

        embeds.push(postEmbed);
    }

    // 全ての投稿を返信
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            content: `${title}（全${posts.length}件）`,
            embeds: embeds,
            components: []
        });
    } else {
        await interaction.reply({
            content: `${title}（全${posts.length}件）`,
            embeds: embeds,
            components: [],
            flags: 64
        });
    }
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
    generateId,
    sendNotification // 通知送信関数も公開
};