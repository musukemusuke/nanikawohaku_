const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mylikes')
        .setDescription('自分の投稿にいいねしたユーザーを確認します'),
    async execute(interaction) {
        const db = interaction.client.db;
        const userId = interaction.user.id;

        // 自分が作成した全ての投稿を取得（リプライを除く）
        db.all(`SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC`, [userId], async (err, myPosts) => {
            if (err) {
                console.error('Error getting my posts:', err.message);
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ エラー')
                    .setDescription('投稿の取得中にエラーが発生しました。')
                    .setTimestamp();
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }

            if (myPosts.length === 0) {
                const noPostsEmbed = new EmbedBuilder()
                    .setColor(0xff9900)
                    .setTitle('⚠️ 投稿がありません')
                    .setDescription('あなたの投稿が見つかりませんでした。')
                    .setTimestamp();
                return interaction.reply({ embeds: [noPostsEmbed], flags: 64 });
            }

            // 各投稿にいいねしたユーザーの情報を非同期で取得
            const allPostsWithLikes = [];
            for (const post of myPosts) {
                await new Promise((resolve) => {
                    db.all(`SELECT user_id FROM user_likes WHERE post_id = ?`, [post.id], (err, likes) => {
                        if (err) {
                            console.error('Error getting likes for post:', err.message);
                            resolve();
                            return;
                        }

                        const likedUserIds = likes.map(like => like.user_id);
                        allPostsWithLikes.push({
                            ...post,
                            likedUserIds: likedUserIds
                        });
                        resolve();
                    });
                });
            }

            // feed.jsと同じページネーションロジックを使用
            const limit = 5; // 1ページあたりの表示件数
            const totalPages = Math.ceil(allPostsWithLikes.length / limit);

            const displayPage = async (page, originalInteraction = null) => {
                const start = page * limit;
                const end = start + limit;
                const pageRows = allPostsWithLikes.slice(start, end);

                const embeds = [];
                const allComponents = [];

                for (let i = 0; i < pageRows.length; i++) {
                    const row = pageRows[i];
                    const member = await interaction.guild.members.fetch(row.author_id).catch(() => null);
                    const displayName = member ? member.displayName : row.author_username;

                    // いいねしたユーザーのメンションリストを作成
                    let likedUsersText = 'いいねしたユーザーはいません';
                    if (row.likedUserIds.length > 0) {
                        const userMentions = await Promise.all(row.likedUserIds.map(async (uid) => {
                            const likedMember = await interaction.guild.members.fetch(uid).catch(() => null);
                            return likedMember ? `<@${uid}>` : `不明なユーザー(${uid})`;
                        }));
                        likedUsersText = userMentions.join('\n');
                    }

                    const rowEmbed = new EmbedBuilder()
                        .setAuthor({ name: `${displayName} (@${row.author_username})` })
                        .setDescription(`**${row.content}**`)
                        .addFields(
                            { name: '投稿ID', value: row.id, inline: true },
                            { name: '総いいね数', value: `${row.likes}`, inline: true },
                            { name: 'いいねしたユーザー', value: likedUsersText, inline: false }
                        )
                        .setColor(0x00FF00)
                        .setTimestamp(new Date(row.created_at));

                    if (row.image_url) {
                        rowEmbed.setImage(row.image_url);
                    }
                    embeds.push(rowEmbed);
                }

                if (totalPages > 1) {
                    const pageMessageId = interaction.id;
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

                    const pageRow = new ActionRowBuilder()
                        .addComponents(prevButton, nextButton);
                    allComponents.push(pageRow);

                    if (!originalInteraction) {
                        // 初期表示時にページ情報を保存
                        interaction.client.pageInteractions.set(pageMessageId, {
                            originalInteraction: interaction,
                            allRows: allPostsWithLikes,
                            currentPage: page,
                            totalPages: totalPages,
                            userId: interaction.user.id,
                            messageId: pageMessageId
                        });
                    }
                }

                const title = '自分の投稿へのいいね一覧';
                if (originalInteraction) {
                    // ページ更新時
                    await interaction.update({
                        content: `${title} - ${page + 1}/${totalPages}ページ`,
                        embeds: embeds,
                        components: allComponents,
                        flags: 64
                    });
                } else {
                    // 初期表示時
                    await interaction.reply({
                        content: `${title} - ${page + 1}/${totalPages}ページ`,
                        embeds: embeds,
                        components: allComponents,
                        flags: 64
                    });
                }
            };

            // 最初のページを表示
            await displayPage(0);
        });
    }
};