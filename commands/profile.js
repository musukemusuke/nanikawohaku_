const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createPaginatedFeed } = require('../utils/pagination.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('ユーザーのプロフィールを表示します')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('プロフィールを表示するユーザー（指定しないと自分自身）')
                .setRequired(false)),
    async execute(interaction) {
        const db = interaction.client.db;
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetUserId = targetUser.id;
        const currentUserId = interaction.user.id;

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

        // プロフィールの基本情報Embedを作成
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

        await interaction.reply({ embeds: [profileEmbed], flags: 64 });

        // 投稿があれば続けてページネーションで表示
        if (userPosts.length > 0) {
            setTimeout(async () => {
                await createPaginatedFeed(interaction, userPosts, `${targetUser.username}さんの最近の投稿`, true);
            }, 1000);
        }
    }
};