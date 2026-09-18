const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view')
        .setDescription('各種コンテンツを閲覧するコマンドです')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('閲覧したいコンテンツの種類')
                .setRequired(true)
                .addChoices(
                    { name: 'リプライ一覧', value: 'replies' },
                    { name: 'いいねしたユーザー', value: 'likes' },
                    { name: 'リポストしたユーザー', value: 'reposts' },
                    { name: 'フォロワー一覧', value: 'followers' },
                    { name: 'フォロー中のユーザー', value: 'following' },
                    { name: '過去の投稿履歴', value: 'history' },
                    { name: '添付メディア一覧', value: 'media' }
                ))
        .addStringOption(option =>
            option.setName('id')
                .setDescription('対象の投稿IDまたはユーザーID')
                .setRequired(true)),
    async execute(interaction) {
        const type = interaction.options.getString('type');
        const targetId = interaction.options.getString('id');
        const db = interaction.client.db;

        if (type === 'replies') {
            // リプライ一覧表示処理
            const postId = targetId;
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

                    const allItems = [post, ...replies];
                    await createPaginatedFeed(interaction, allItems, `投稿「${post.id}」のリプライ一覧`, false);
                });
            });
        } else if (type === 'likes') {
            // いいねしたユーザー一覧表示処理
            const postId = targetId;
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

                db.all(`SELECT u.* FROM user_likes l JOIN users u ON l.user_id = u.id WHERE l.post_id = ? ORDER BY l.created_at DESC LIMIT 50`, [postId], async (err, likes) => {
                    if (err) {
                        console.error('Error fetching likes:', err.message);
                        await interaction.reply({ content: 'いいねユーザーの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (likes.length === 0) {
                        await interaction.reply({ content: 'この投稿にはまだいいねがありません。', flags: 64 });
                        return;
                    }

                    // ユーザー一覧をEmbedで表示
                    const likeList = likes.map((user, i) => `${i+1}. <@${user.id}> (${user.username})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setColor(0x1DA1F2)
                        .setTitle(`❤️ 投稿「${post.id}」のいいね一覧`)
                        .setDescription(likeList)
                        .setFooter({ text: `全${likes.length}件` });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                });
            });
        } else if (type === 'reposts') {
            // リポストしたユーザー一覧表示処理
            const postId = targetId;
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

                db.all(`SELECT u.* FROM reposts r JOIN users u ON r.user_id = u.id WHERE r.original_post_id = ? ORDER BY r.created_at DESC LIMIT 50`, [postId], async (err, reposts) => {
                    if (err) {
                        console.error('Error fetching reposts:', err.message);
                        await interaction.reply({ content: 'リポストユーザーの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (reposts.length === 0) {
                        await interaction.reply({ content: 'この投稿にはまだリポストがありません。', flags: 64 });
                        return;
                    }

                    // ユーザー一覧をEmbedで表示
                    const repostList = reposts.map((user, i) => `${i+1}. <@${user.id}> (${user.username})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setColor(0x1DA1F2)
                        .setTitle(`🔄 投稿「${post.id}」のリポスト一覧`)
                        .setDescription(repostList)
                        .setFooter({ text: `全${reposts.length}件` });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                });
            });
        } else if (type === 'followers') {
            // フォロワー一覧表示処理
            const userId = targetId;
            db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
                if (err) {
                    console.error('Error fetching user:', err.message);
                    await interaction.reply({ content: 'ユーザーの取得中にエラーが発生しました。', flags: 64 });
                    return;
                }

                if (!user) {
                    await interaction.reply({ content: '指定されたIDのユーザーが存在しません。', flags: 64 });
                    return;
                }

                db.all(`SELECT u.* FROM user_follows f JOIN users u ON f.follower_id = u.id WHERE f.followed_id = ? ORDER BY f.created_at DESC LIMIT 50`, [userId], async (err, followers) => {
                    if (err) {
                        console.error('Error fetching followers:', err.message);
                        await interaction.reply({ content: 'フォロワーの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (followers.length === 0) {
                        await interaction.reply({ content: 'このユーザーにはまだフォロワーがいません。', flags: 64 });
                        return;
                    }

                    // フォロワー一覧をEmbedで表示
                    const followerList = followers.map((u, i) => `${i+1}. <@${u.id}> (${u.username})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setColor(0x1DA1F2)
                        .setTitle(`👥 ${user.username}さんのフォロワー一覧`)
                        .setDescription(followerList)
                        .setFooter({ text: `全${followers.length}件` });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                });
            });
        } else if (type === 'following') {
            // フォロー中のユーザー一覧表示処理
            const userId = targetId;
            db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
                if (err) {
                    console.error('Error fetching user:', err.message);
                    await interaction.reply({ content: 'ユーザーの取得中にエラーが発生しました。', flags: 64 });
                    return;
                }

                if (!user) {
                    await interaction.reply({ content: '指定されたIDのユーザーが存在しません。', flags: 64 });
                    return;
                }

                db.all(`SELECT u.* FROM user_follows f JOIN users u ON f.followed_id = u.id WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 50`, [userId], async (err, followings) => {
                    if (err) {
                        console.error('Error fetching followings:', err.message);
                        await interaction.reply({ content: 'フォロー中のユーザーの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (followings.length === 0) {
                        await interaction.reply({ content: 'このユーザーはまだ誰もフォローしていません。', flags: 64 });
                        return;
                    }

                    // フォロー中のユーザー一覧をEmbedで表示
                    const followingList = followings.map((u, i) => `${i+1}. <@${u.id}> (${u.username})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setColor(0x1DA1F2)
                        .setTitle(`➡️ ${user.username}さんがフォロー中のユーザー一覧`)
                        .setDescription(followingList)
                        .setFooter({ text: `全${followings.length}件` });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                });
            });
        } else if (type === 'history') {
            // ユーザーの過去の投稿履歴を表示処理
            const userId = targetId;
            db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
                if (err) {
                    console.error('Error fetching user:', err.message);
                    await interaction.reply({ content: 'ユーザーの取得中にエラーが発生しました。', flags: 64 });
                    return;
                }

                if (!user) {
                    await interaction.reply({ content: '指定されたIDのユーザーが存在しません。', flags: 64 });
                    return;
                }

                db.all(`SELECT * FROM posts WHERE author_id = ? AND is_private = 0 ORDER BY created_at DESC LIMIT 50`, [userId], async (err, posts) => {
                    if (err) {
                        console.error('Error fetching posts:', err.message);
                        await interaction.reply({ content: '投稿履歴の取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    if (posts.length === 0) {
                        await interaction.reply({ content: 'このユーザーには公開投稿がありません。', flags: 64 });
                        return;
                    }

                    // ページネーションを使って投稿一覧を表示
                    await createPaginatedFeed(interaction, posts, `${user.username}さんの過去の投稿一覧`, false);
                });
            });
        } else if (type === 'media') {
            // 指定した投稿に添付されているメディア一覧表示処理
            const postId = targetId;
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

                // まず指定した投稿のメディアを取得
                const mediaList = [];
                if (post.image_url) {
                    mediaList.push(post.image_url);
                }

                // 同じユーザーの他の投稿のメディアも一緒に取得（最大50件）
                db.all(`SELECT * FROM posts WHERE author_id = ? AND image_url IS NOT NULL AND is_private = 0 ORDER BY created_at DESC LIMIT 50`, [post.author_id], async (err, allPostsWithMedia) => {
                    if (err) {
                        console.error('Error fetching media posts:', err.message);
                        await interaction.reply({ content: 'メディアの取得中にエラーが発生しました。', flags: 64 });
                        return;
                    }

                    // 全てのメディアURLを抽出
                    const allMedia = allPostsWithMedia
                        .map(p => p.image_url)
                        .filter(url => url);

                    if (allMedia.length === 0) {
                        await interaction.reply({ content: 'この投稿またはユーザーには添付メディアがありません。', flags: 64 });
                        return;
                    }

                    // メディア一覧をEmbedで表示
                    const mediaDescription = allMedia.map((url, i) => `${i+1}. [メディアURL](${url})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setColor(0x1DA1F2)
                        .setTitle(`🖼️ ユーザー「${post.author_username}」の添付メディア一覧`)
                        .setDescription(mediaDescription)
                        .setFooter({ text: `全${allMedia.length}件` });

                    await interaction.reply({ embeds: [embed], flags: 64 });
                });
            });
        }
    }
};