const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feed')
        .setDescription('投稿フィードを表示します。')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('表示する投稿の種類を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '🌐', value: 'public' },
                    { name: '📝', value: 'my_posts' },
                    { name: '💬', value: 'my_replies' },
                    { name: '❤️', value: 'my_likes' }
                )),
    async execute(interaction) {
        const type = interaction.options.getString('type');
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const channel = interaction.channel;

        let query = '';
        let params = [];
        let title = '';

        switch (type) {
            case 'public': // 最新の公開投稿
                query = `SELECT * FROM posts WHERE guild_id = ? AND is_private = 0 ORDER BY created_at DESC LIMIT 5`;
                params = [guildId];
                title = '最新の公開投稿';
                break;
            case 'my_posts': // 自分の投稿
                query = `SELECT * FROM posts WHERE guild_id = ? AND author_id = ? ORDER BY created_at DESC LIMIT 5`;
                params = [guildId, userId];
                title = 'あなたの投稿';
                break;
            case 'my_replies': // 自分が投稿したリプライ
                query = `SELECT * FROM replies WHERE author_id = ? AND guild_id = ? ORDER BY created_at DESC LIMIT 5`;
                params = [userId, guildId];
                title = 'あなたが投稿したリプライ';
                break;
            case 'my_likes': // 自分がいいねした投稿
                query = `SELECT posts.* FROM posts JOIN user_likes ON posts.id = user_likes.post_id WHERE posts.guild_id = ? AND user_likes.user_id = ? ORDER BY posts.created_at DESC LIMIT 5`;
                params = [guildId, userId];
                title = 'あなたがいいねした投稿';
                break;
        }

        // 以降の表示処理を実行
        db.all(query, params, async (err, allPosts) => {
            if (err) {
                console.error('Error getting posts:', err);
                await interaction.reply({ content: '投稿の取得中にエラーが発生しました。', flags: 64 }); // ephemeral
                return;
            }
            console.log('feedで取得したposts:', allPosts); // デバッグ用ログ追加
            if (allPosts.length === 0) {
                await interaction.reply({ content: '該当する投稿がありませんでした。', flags: 64 }); // ephemeral
                return;
            }

            // ページングのための初期処理
            const limit = 5;
            let currentPage = 0;
            const totalPages = Math.ceil(allPosts.length / limit);

            // 最初のページを表示
            const displayPage = async (page) => {
                const start = page * limit;
                const end = start + limit;
                const pageRows = allPosts.slice(start, end);

                // 全ての投稿をembedの配列にまとめる
                const embeds = [];
                const allComponents = [];

                for (let i = 0; i < pageRows.length; i++) {
                    const row = pageRows[i];
                    let rowEmbed;
                    const isReply = type === 'my_replies';
                    const member = await interaction.guild.members.fetch(row.author_id).catch(() => null);
                    const displayName = member ? member.displayName : row.author_username;
                    if (row.post_id) { // リプライの場合（repliesテーブルの行）
                        rowEmbed = new EmbedBuilder()
                            .setTitle(`リプライID: ${row.id}`)
                            .setAuthor({ name: `${displayName} (@${row.author_username})` })
                            .setDescription(`**${row.content}**`)
                            .addFields({ name: '元の投稿ID', value: row.post_id })
                            .setColor(0x0099FF)
                            .setTimestamp(new Date(row.created_at));
                    } else { // 通常の投稿の場合（postsテーブルの行）
                        rowEmbed = new EmbedBuilder()
                            .setAuthor({ name: `${displayName} (${row.author_username})` })
                            .setDescription(`**${row.content}**`)
                            .setTimestamp(new Date(row.created_at))
                            .setFooter({ text: `投稿ID: ${row.id} | いいね: ${row.likes}` });
                        if (row.image_url) {
                            rowEmbed.setImage(row.image_url);
                        }
                    }
                    embeds.push(rowEmbed);
                }

                // ページングボタンも追加
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

                    interaction.client.pageInteractions.set(pageMessageId, {
                        originalInteraction: interaction,
                        query: query,
                        params: params,
                        title: title,
                        allRows: allPosts,
                        currentPage: page,
                        totalPages: totalPages,
                        userId: interaction.user.id,
                        messageId: pageMessageId
                    });
                }

                // エフェメラルで一括更新（元のメッセージを置き換え）
                await interaction.reply({
                    content: `${title} - ${page + 1}/${totalPages}ページ`,
                    embeds: embeds,
                    components: allComponents,
                    flags: 64 // ephemeral
                });
            };

            await displayPage(currentPage);
        });
    },
    async handlePageButton(interaction) {
        // タイムアウト回避のため最初にdeferUpdate
        await interaction.deferUpdate();
        const [action, _, pageMessageId] = interaction.customId.split('_');
        const pageData = interaction.client.pageInteractions.get(pageMessageId);
        
        if (!pageData || interaction.user.id !== pageData.userId) {
            await interaction.reply({ content: 'この操作はできません。', flags: 64 });
            return;
        }

        const db = interaction.client.db;
        const channel = interaction.channel;
        const allRows = pageData.allRows;
        let currentPage = pageData.currentPage;
        const totalPages = pageData.totalPages;
        const title = pageData.title;
        const limit = 5;

        if (action === 'next' && currentPage < totalPages - 1) {
            currentPage++;
        } else if (action === 'prev' && currentPage > 0) {
            currentPage--;
        } else {
            await interaction.reply({ content: 'これ以上ページを移動できません。', flags: 64 });
            return;
        }

        // 新しいページを表示
        const start = currentPage * limit;
        const end = start + limit;
        const pageRows = allRows.slice(start, end);

        // 全ての投稿をembedの配列にまとめる
        const embeds = [];
        const allComponents = [];

        for (let i = 0; i < pageRows.length; i++) {
            const row = pageRows[i];
            let rowEmbed;
            const pageInteraction = pageData.originalInteraction;
            const isReply = row.post_id !== undefined; // リプライかどうかを行の存在で判断
            const member = await pageInteraction.guild.members.fetch(row.author_id).catch(() => null);
            const displayName = member ? member.displayName : row.author_username;
            if (row.post_id) { // リプライの場合（repliesテーブルの行）
                rowEmbed = new EmbedBuilder()
                    .setTitle(`リプライID: ${row.id}`)
                    .setAuthor({ name: `${displayName} (@${row.author_username})` })
                    .setDescription(row.content)
                    .addFields({ name: '元の投稿ID', value: row.post_id })
                    .setColor(0x0099FF)
                    .setTimestamp(new Date(row.created_at));
            } else { // 通常の投稿の場合（postsテーブルの行）
                const description = row.image_url ? `${row.content}\n${row.image_url}` : row.content;
                rowEmbed = new EmbedBuilder()
                    .setTitle(`投稿ID: ${row.id}`)
                    .setAuthor({ name: `${displayName} (${row.author_username})` })
                    .setDescription(description)
                    .setColor(0x00FF00)
                    .setTimestamp(new Date(row.created_at))
                    .setFooter({ text: `いいね: ${row.likes}` });
            }
            embeds.push(rowEmbed);
        }

        // ページングボタンも追加
        if (totalPages > 1) {
            const newPrevButton = new ButtonBuilder()
                .setCustomId(`prev_page_${pageMessageId}`)
                .setLabel('前へ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
                .setDisabled(currentPage === 0);

            const newNextButton = new ButtonBuilder()
                .setCustomId(`next_page_${pageMessageId}`)
                .setLabel('次へ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('➡️')
                .setDisabled(currentPage >= totalPages - 1);

            const pageRow = new ActionRowBuilder()
                .addComponents(newPrevButton, newNextButton);
            allComponents.push(pageRow);
        }

        // 一括更新（元のメッセージを置き換え）
        await pageData.originalInteraction.editReply({
            content: `${title} - ${currentPage + 1}/${totalPages}ページ`,
            embeds: embeds,
            components: allComponents
        });

        await interaction.update({});

        // pageDataのcurrentPageを更新
        const updatedPageData = interaction.client.pageInteractions.get(pageMessageId);
        if (updatedPageData) {
            updatedPageData.currentPage = currentPage;
            interaction.client.pageInteractions.set(pageMessageId, updatedPageData);
        }
    }
};