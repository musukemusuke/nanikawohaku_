const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');
const { saveUserToDB, searchUsersByUsername } = require('../utils/userUtils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('ユーザーのプロフィールを表示します')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('プロフィールを表示するユーザーのユーザー名（指定しないと自分自身）')
                .setRequired(false)),
    async execute(interaction) {
        const db = interaction.client.db;
        const client = interaction.client;
        const searchUsername = interaction.options.getString('username');
        let targetUser = interaction.user;
        let targetUserId = interaction.user.id;
        const currentUserId = interaction.user.id;

        // ユーザー名が指定されている場合は検索
        if (searchUsername) {
            await saveUserToDB(db, interaction.user);
            const users = await searchUsersByUsername(db, client, searchUsername);
            if (users.length === 0) {
                return interaction.reply({ content: `「${searchUsername}」に一致するユーザーが見つかりませんでした。`, flags: 64 });
            }
            // 完全一致するユーザーを優先的に選択
            const exactMatch = users.find(u => u.username.toLowerCase() === searchUsername.toLowerCase());
            const targetUserDB = exactMatch || users[0];
            targetUserId = targetUserDB.id;
            try {
                targetUser = await client.users.fetch(targetUserId);
                await saveUserToDB(db, targetUser);
            } catch (err) {
                return interaction.reply({ content: '指定されたユーザーが存在しません。', flags: 64 });
            }
        }

        // フォロー数・フォロワー数を取得
        const followingCount = await new Promise((resolve) => {
            db.get(`SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?`, [targetUserId], (err, row) => {
                resolve(row ? row.count : 0);
            });
        });

        const followersCount = await new Promise((resolve) => {
            db.get(`SELECT COUNT(*) as count FROM user_follows WHERE followed_id = ?`, [targetUserId], (err, row) => {
                resolve(row ? row.count : 0);
            });
        });

        // 現在のユーザーがこのユーザーをフォローしているか確認
        const isFollowing = await new Promise((resolve) => {
            db.get(`SELECT 1 FROM user_follows WHERE follower_id = ? AND followed_id = ?`, [currentUserId, targetUserId], (err, row) => {
                resolve(!!row);
            });
        });

        // ユーザーの公開投稿一覧を取得
        const userPosts = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM posts 
                WHERE author_id = ? AND is_private = 0
                ORDER BY created_at DESC
                LIMIT 20
            `, [targetUserId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        // プロフィールの基本情報を先に作成しておく
        const profileEmbed = new EmbedBuilder()
            .setColor(0x1DA1F2)
            .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
            .setTitle(`${targetUser.username}さんのプロフィール`)
            .addFields(
                { name: 'フォロー', value: `${followingCount}人`, inline: true },
                { name: 'フォロワー', value: `${followersCount}人`, inline: true },
                { name: '公開投稿数', value: `${userPosts.length}件`, inline: true },
                { name: 'フォロー状況', value: isFollowing ? '✅ フォロー中' : '❌ 未フォロー', inline: true }
            )
            .setTimestamp();

        // 投稿がある場合はプロフィールと一緒にcreatePaginatedFeedで返信、なければ単独で返信
        if (userPosts.length > 0) {
            // createPaginatedFeed内で最初の返信を行うので、ここでは何もしない
            await createPaginatedFeed(interaction, userPosts, `${targetUser.username}さんの最近の投稿`, true, profileEmbed);
        } else {
            // 投稿がない場合はプロフィールだけを返信
            await interaction.reply({ embeds: [profileEmbed], flags: 64 });
        }
    }
};